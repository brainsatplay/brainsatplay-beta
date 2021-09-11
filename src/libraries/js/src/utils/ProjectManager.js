import JSZip from 'jszip'
import fileSaver from 'file-saver';
import * as brainsatplayLocal from '../../brainsatplay'

let latest = '0.0.32'
let cdnLink = `https://cdn.jsdelivr.net/npm/brainsatplay@${latest}`;

import * as blobUtils from './blobUtils'

export class ProjectManager {
    constructor(
        session
        ) {
        this.helper = new JSZip();
        this.session = session
        this.folders = {
            app: null
        }

        this.latest = latest
        this.script = document.createElement("script");

        this.local = window.location.origin.includes('localhost')
        if (!this.local) this.version = this.latest
        else this.version = 'experimental'

        // Load Latest B@P Library
        this.libraries = {
            experimental: brainsatplayLocal
        }

        if (this.version != 'experimental'){
            this.getLibraryVersion(latest)
        }

        // Set Server Connection Variables
        this.serverResolved = true
        this.publishURL = (this.local) ? 'http://localhost/apps' : 'https://server.brainsatplay.com/apps'

        this.createDefaultHTML = (script) => {
            return `
        <!DOCTYPE html> 
        <html lang="en"> 
            <head>
                <title>Brains@Play Starter Project</title>
                <link rel='stylesheet' href='./style.css'>
                <script src="${cdnLink}"></script>
                ${script}
            </head>
            <body></body>
        </html>
        `}
    }

    getLibraryVersion = async (version='experimental') => {

        if (version != 'experimental' && Number.parseInt(version.split('.')[2]) < 33) version = 'experimental' // FIX: Any lower versions are not supported

        return new Promise(resolve => {
            if (this.libraries[version] == null){
                this.script.src = `https://cdn.jsdelivr.net/npm/brainsatplay@${version}`
                this.script.async = true;
                this.script.onload = () => {
                    console.log('loading version')
                    if (brainsatplay) {
                        this.libraries[version] = brainsatplay
                        resolve(this.libraries[version])
                    }
                }
                document.body.appendChild(this.script);
            } else {
                resolve(this.libraries[version])
            }
        })
    }

    getPlugins = (version) =>{
        let module = this.libraries[version]
        let plugins = []
        for (let type in module.plugins) {
            for (let name in module.plugins[type]) {
                plugins.push({ name: name, id:module.plugins[type][name].id, label: `brainsatplay.plugins.${type}.${name}` })
            }
        }
        return plugins
    }

    addDefaultFiles() {
        this.helper.file("index.html", this.createDefaultHTML(`<script src="./index.js" type="module"></script>`))


        this.helper.file("style.css", `body {
    font-family: Montserrat, sans-serif;
    color: white;
    background: black;
    width: 100vw; 
    height: 100vh;
}
        
#application {
    width: 100%; 
    height: 100%;
    display: flex;
    align-items: center; 
    justify-content: center; 
}`)

        this.helper.file("index.js", `import {settings} from './app/settings.js'
let app =  new brainsatplay.Application(settings)
app.init()`)



    }

    initializeZip = () => {
        this.helper.remove("app")
        this.folders.app = this.helper.folder("app")
        this.addDefaultFiles()
    }

    generateZip(app, callback) {
        
        this.initializeZip()
        let o = this.appToFile(app)
        o.classes.forEach(c => {
            this.addClass(c)
        })

        // Combine Custom Plugins into the Compact File
        let combined = ``;
        o.classes.forEach(c => combined += c.prototype.constructor.toString())
        combined += o.combined;

        this.folders.app.file(o.filename, o.data)
        this.helper.file("compact.html", `
            <!DOCTYPE html> 
            <html lang="en"> 
                <head>
                    <title>Brains@Play Starter Project (Single Threaded)</title>
                    <style>
                        body {
                            font-family: Montserrat, sans-serif;
                            color: white;
                            background: black;
                            width: 100vw; 
                            height: 100vh;
                        }
                                
                        #application {
                            width: 100%; 
                            height: 100%;
                            display: flex;
                            align-items: center; 
                            justify-content: center; 
                        }
                    </style>
                    <script src="${cdnLink}"></script>
                    <script type="module">
                        ${combined}
                        let app =  new brainsatplay.Application(settings);
                        app.init();
                    </script>
                </head>
                <body></body>
            </html>`)
        this.helper.generateAsync({ type: "blob" })
            .then(function (content) {
                callback(content)
            });
    }

    classToFile(cls) {
        return { filename: `${cls.name}.js`, data: cls.toString() + `\nexport {${cls.name}}` }
    }

    addClass(cls) {
        let info = this.classToFile(cls)
        return this.folders.app.file(info.filename, info.data)
    }

    loadFromFile() {
        return new Promise(async (resolve) => {
            let fileArray = await new Promise(resolve => {
                let input = document.createElement('input')
                input.type = 'file'
                input.accept = ".zip"
                input.click()

                input.onchange = (e) => {
                    let fileList = input.files;
                    for (let file of fileList) {
                        this.helper.loadAsync(file)
                            .then(async (zip) => {
                                let fileArray = await this.getFilesFromZip(zip)
                                resolve(fileArray)
                            })
                    }
                }
            })
            let settings = await this.load(fileArray)
            resolve(settings)
        })
    }

    getFilesFromZip(zip){
        return new Promise(resolve => {
            let fileArray = []
            let i = 0
            for (let filename in zip.files) {
                let split = filename.split('app/')
                if (split.length === 2 && split[1] != '') {
                    zip.file(filename).async("string").then(content => {
                        fileArray.push({ content, filename: filename.split('app/')[1] })
                        i++
                        if (i == Object.keys(zip.files).length) resolve(fileArray)
                    })
                } else {
                    i++
                }
            }
        })
    }

    _prettyPrint(string, indent='\t'){
        // string = string.replaceAll('{', '{\n')
        // string = string.replaceAll('}', '\n}')
        // string = string.replaceAll(',', ',\n')

        return string
    }

    appToFile(app) {

        let info = Object.assign({}, app.info) //JSON.parse(JSON.stringifyWithCircularRefs(app.info))
        info.graph = Object.assign({}, info.graph)
        info.graph.nodes = info.graph.nodes.map(n => Object.assign({}, n))

        // Default Settings
        info.connect = true

        if (info.version == null) info.version = this.version
        delete info.editor

        let plugins = this.getPlugins(info.version)

        let imports = ``
        // Add imports
        let classNames = []
        let classes = []
        app.info.graph.nodes.forEach(n => {
            let found = plugins.find(o => { 
                if (o.id === n.class.id) return o 
            })
            // let saveable = this.checkIfSaveable(n.class)
            if (!found && !classNames.includes(n.class.name)) {
                imports += `import {${n.class.name}} from "./${n.class.name}.js"\n`
                classNames.push(n.class.name)
                classes.push(n.class)
            } else if (found) {
                classNames.push(found.label)
            } else if (classNames.includes(n.class.name)) {
                classNames.push(n.class.name)
            }
        })


        info.graph.nodes.forEach((n, i) => {

            // FIX
            // for (let k in n.params){ 
            //     // Delete non-editable elements
            //     if (n.instance.ports[k]?.edit === false) {
            //         delete n.params[k] 
            //     }

            //     // Delete if non-stringifiable object
            //     if (typeof n.params[k] === 'object' ){
            //         let result = JSON.parse(JSON.stringify(n.params[k]))
            //         if (typeof result !== 'object' || Object.keys(result).length == 0){ // Removes Elements
            //             delete n.params[k]
            //         } else {
            //             n.params[k] = result
            //         }
            //     }
            // } 

            delete n['instance']
            delete n['ui']
            delete n['fragment']
            delete n['controls']
            delete n['analysis']
            n.class = `${classNames[i]}`
        })

        for (let key in info.graph) {
            if (key != 'nodes' && key != 'edges') {
                delete info.graph[key]
            }
        }

        info = JSON.stringifyWithCircularRefs(info, '\t')

        // Replace Stringified Class Names with Actual References (provided by imports)
        var re = /"class":\s*"([^\/"]+)"/g;
        var m;

        do {
            m = re.exec(info);
            if (m) {
                info = info.replaceAll(m[0], '"class":' + m[1])
            }
        } while (m);

        return {
            name: app.info.name, filename: 'settings.js', data: `${imports}
        
        export const settings = ${info};`, combined: `const settings = ${this._prettyPrint(info)};\n`, classes
        }
    }

    classToFile(cls) {
        return { filename: `${cls.name}.js`, data: cls.toString() + `\nexport {${cls.name}}`, combined: cls.toString() + `\n` }
    }

    download(app, filename = app.info.name ?? 'brainsatplay') {
        this.generateZip(app, (zip) => {
            fileSaver.saveAs(zip, `${filename}.zip`);
        })
    }

    async publish(app) {
        let dataurl = await this.appToDataURL(app)
        await this.session.dataManager.saveFile(dataurl, `/projects/${app.info.name}`)  
        fetch(this.publishURL, {
            method: 'POST',
            headers: {
                'Content-type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify({
                name: app.info.name,
                authorId: this.session.info.auth.username,
                dataurl
            })
        }).then(res => res.json()).then(async data => {
            console.log('App Published!')
        }).catch(function (error) {
            console.warn('Something went wrong.', error);
        });
    }

    async appToDataURL(app){
        return new Promise(resolve => {
            this.generateZip(app, (blob) => {
                blobUtils.blobToDataURL(blob, async (dataurl) => {
                    resolve(dataurl)
                })
            })
        })
    }


    async save(app) {
        let dataurl = await this.appToDataURL(app)
        await this.session.dataManager.saveFile(dataurl, `/projects/${app.info.name}`)  
        console.log('App Saved!')
      
    }

    async getPublishedApps() {
        return new Promise((resolve, reject) => {
            let apps = []
            if (this.serverResolved){
                fetch(this.publishURL, {
                    method: 'GET',
                }).then(res => res.json()).then(data => {
                    data.forEach(async(url) => {
                        let files = await this.getFilesFromDataURL(url)
                        let project = await this.load(files)
                        apps.push(project)
                        if (apps.length === data.length) resolve(apps)
                    })
                }).catch((error) => {
                    console.warn('Server down.');
                    this.serverResolved = false
                    resolve(apps)
                });
            } else resolve(apps)
        })
    }

    async list() {
        let projects = {
            local: [],
            published: []
        }
        projects.local = new Set(await this.session.dataManager.readFiles(`/projects/`))
        return projects
    }

    async getFilesFromDataURL(url){
        let fileArray = []
        return new Promise(async (resolve, reject) => {
            let blob = blobUtils.dataURLtoBlob(url.toString('utf-8'))

            if (blob){
                this.helper.loadAsync(blob)
                .then(async (zip) => {
                    let arr = await this.getFilesFromZip(zip)
                    arr.forEach((o,i) => {
                        fileArray.push(o)
                        if (i == arr.length - 1) resolve(fileArray)
                    })
                })
            } else console.error('Not a data url')
        })
    }


    // Only save if a class instance can be created from the constructor string
    checkIfSaveable(node){
        let editable = false
        try {
            let constructor = node.prototype.constructor.toString()
            let cls = eval(`(${constructor})`)
            let instance = new cls() // This triggers the catch
            editable = true
        }
        catch (e) {console.log('Cannot Save Node', e)}

        return editable
    }

    async getFilesFromDB(name) {
        return new Promise(async (resolve, reject) => {
            let projects = await this.session.dataManager.readFiles(`/projects/`)
            let file = projects.filter(s => s.includes(name))
            file = file[0]
            let url = await this.session.dataManager.readFile(`/projects/${file}`)
            let blob = await this.getFilesFromDataURL(url)
            resolve(blob)
        })
    }

    async load(files) {
        return new Promise(async (resolve, reject) => {
            try {
                if (files.length > 0) {
                    let info = await new Promise(async resolve => {
                        let info = {
                            settings: null,
                            classes: []
                        }

                        files.forEach(async (o, i) => {
                            if (o.filename.includes('settings.js')) {
                                info.settings = o.content
                            }
                            else {
                                info.classes.push(o.content)
                            }
                            if (i == files.length - 1) resolve(info)
                        })
                    })

                    let classes = {}
                    info.classes.forEach(c => {
                        c = eval(`(${c.split('export')[0]})`)
                        classes[c.name] = c
                    })

                    // Replace Class Imports with Random Ids (to avoid stringifying)
                    let classMap = {}
                    var re = /import\s+{([^{}]+)}[^\n]+/g;
                    let m;
                    do {
                        m = re.exec(info.settings)
                        if (m == null) m = re.exec(info.settings); // be extra sure (weird bug)
                        if (m) {
                            let id = String(Math.floor(Math.random() * 1000000))
                            classMap[id] = {
                                name: m[1],
                                class: classes[m[1]]
                            }
                            info.settings = info.settings.replace(m[0], ``)
                            info.settings = info.settings.replaceAll(`"class":${m[1]}`, `"class":${id}`)
                        }
                    } while (m);

                    var re = /brainsatplay\.([^\.\,}]+)\.([^\.\,}]+)\.([^\.\,}]+)/g;
                    let m2;

                    let library;
                    let version = info.settings.match(/"version":\s?"([^"]+)/)
                    if (version){
                        library = await this.getLibraryVersion(version[1])
                    } else {
                        library = await this.getLibraryVersion('experimental')
                    }

                    do {
                        m2 = re.exec(info.settings);
                        if (m2 == null) m2 = re.exec(info.settings) // be extra sure (weird bug)
                        if (m2) {
                            let defaultClass = library[m2[1]]
                            for (let i = 2; i < m2.length; i++) {
                                defaultClass = defaultClass[m2[i]]
                            }

                            let id = String(Math.floor(Math.random() * 1000000))
                            classMap[id] = {
                                name: m2[m2.length - 1],
                                class: defaultClass
                            }
                            info.settings = info.settings.replaceAll(m2[0], id)
                        }
                    } while (m2);

                    let settings
                    try {
                        let moduleText = "data:text/javascript;base64," + btoa(info.settings);
                        let module = await import(moduleText);
                        settings = module.settings
                        // Replace Random IDs with Classes
                        settings.graph.nodes.forEach(n => {
                            n.class = classMap[n.class].class
                        })

                        resolve(settings)
                    } catch (e) {
                        console.error(e);
                        resolve(false)
                    }
                } else { console.error('file array is empty'); resolve(false) }
            } catch (e) { 
                console.error(e) 
                resolve(false)
            }
        })
    }
}