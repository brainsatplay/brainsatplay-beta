import JSZip from 'jszip'
import fileSaver from 'file-saver';
import * as brainsatplayES6 from '../../brainsatplay'

// const script = document.createElement("script");
// script.src = './_dist_/libraries/js/dist/brainsatplay.js'
// script.async = true;
// // script.type = 'module'

let latest = "https://cdn.jsdelivr.net/npm/brainsatplay@0.0.22";
// script.onload = () => {
//     console.log('script loaded')
//     console.log('loaded', brainsatplay)
//     if (brainsatplay) latest = brainsatplay
// }
// document.body.appendChild(script);

import * as blobUtils from './blobUtils'


let defaultPlugins = []
for (let type in brainsatplayES6.plugins) {
    for (let name in brainsatplayES6.plugins[type]) {
        defaultPlugins.push({ name: name, id: brainsatplayES6.plugins[type][name].id, label: `brainsatplay.plugins.${type}.${name}` })
    }
}

export class ProjectManager {
    constructor(session, database) {
        this.helper = new JSZip();
        this.session = session
        this.folders = {
            app: this.helper.folder("app")
        }

        this.publishURL = (window.location.origin.includes('localhost')) ? 'http://localhost/apps' : 'https://brainsatplay.com/apps'

        this.createDefaultHTML = (script) => {
            return `
        <!DOCTYPE html> 
        <html lang="en"> 
            <head>
                <title>Brains@Play Starter Project</title>
                <link rel='stylesheet' href='./style.css'>
                <script src="${latest}"></script>
                ${script}
            </head>
            <body></body>
        </html>
        `}
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


    generateZip(app, callback) {
        this.addDefaultFiles()
        let o = this.appToFile(app)
        let combined = ``;
        o.classes.forEach(c => {
            this.addClass(c)

            // // NOTE: Does not appropriately pull in the included classes
            // if(c.combined !== 'undefined' && c.combined !== undefined)
            //     combined+=c.combined;
        })

        app.graph.nodes.forEach(n => {
            combined += n.class.prototype.constructor.toString();
        })

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
                    <script src="${latest}"></script>
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

    appToFile(app) {

        let info = Object.assign({}, app.info) //JSON.parse(JSON.stringifyWithCircularRefs(app.info))
        info.graph = Object.assign({}, info.graph)
        info.graph.nodes = info.graph.nodes.map(n => Object.assign({}, n))

        let imports = ``
        // Add imports
        let classNames = []
        let classes = []
        app.info.graph.nodes.forEach(n => {
            let found = defaultPlugins.find(o => { if (o.id === n.class.id) return o })
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
            delete n['instance']
            delete n['ui']
            delete n['fragment']
            delete n['controls']
            delete n['analysis']
            delete n['editor']
            n.class = `${classNames[i]}`
        })

        for (let key in info.graph) {
            if (key != 'nodes' && key != 'edges') {
                delete info.graph[key]
            }
        }

        info = JSON.stringifyWithCircularRefs(info)

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
        
        export const settings = ${info};`, combined: `const settings = ${info};\n`, classes
        }
    }

    classToFile(cls) {
        return { filename: `${cls.name}.js`, data: cls.toString() + `\nexport {${cls.name}}`, combined: cls.toString() + `\n` }
    }

    download(app, filename = 'brainsatplay') {
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
            fetch(this.publishURL, {
                method: 'GET',
            }).then(res => res.json()).then(data => {
                data.forEach(async(url) => {
                    let files = await this.getFilesFromDataURL(url)
                    let project = await this.load(files)
                    apps.push(project)
                    if (apps.length === data.length) resolve(apps)
                })
            }).catch(function (error) {
                console.warn('Something went wrong.', error);
                resolve(apps)
            });
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
            this.helper.loadAsync(blob)
            .then(async (zip) => {
                let arr = await this.getFilesFromZip(zip)
                arr.forEach((o,i) => {
                    fileArray.push(o)
                    if (i == arr.length - 1) resolve(fileArray)
                })
            })
        })
    }


    // Only save if a class instance can be created from the constructor string
    checkIfSaveable(node){
        let editable = false
        let constructor = node.prototype.constructor.toString()
        try {
            let cls = eval(`(${constructor})`)
            let instance = new cls()
            editable = true
        }
        catch (e) {console.log('variable does not exist')}

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
                    do {
                        m2 = re.exec(info.settings);
                        if (m2 == null) m2 = re.exec(info.settings) // be extra sure (weird bug)
                        if (m2) {
                            let defaultClass = brainsatplayES6[m2[1]]
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