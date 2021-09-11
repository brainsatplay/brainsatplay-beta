import {Graph} from './Graph'
import {LiveEditor} from '../../ui/LiveEditor'
import { DOMFragment } from '../../ui/DOMFragment'
import { StateManager } from '../../ui/StateManager'

// Project Selection
import {appletManifest} from '../../../../../platform/appletManifest' // MUST REMOVE LINKS TO PLATFORM
import { getApplet, getAppletSettings } from "../../../../../platform/js/general/importUtils"

// Node Interaction
import * as dragUtils from './dragUtils'

export class GraphEditor{
    constructor(manager, applet, parentId, onsuccess) {
        this.manager = manager
        this.app = applet
        this.plugins = this.manager.applets[this.app.props.id]
        this.parentNode = document.getElementById(parentId) ?? document.body
        this.element = null
        this.graph=null
        this.shown = false
        this.context = {
            scale: 1
        }
        this.searchOptions = []
        this.classRegistry = {}
        this.local = window.location.origin.includes('localhost')

        this.selectorToggle = null
        this.search = null
        this.state = new StateManager()

        this.lastMouseEvent = {}
        this.editing = false

        this.files = {}

        this.props = {
            id: String(Math.floor(Math.random()*1000000)),
        }

        this.elementTypesToUpdate = ['INPUT', 'SELECT', 'OUTPUT', 'TEXTAREA']
    
        if (this.plugins){

            // Only One Editor (look three levels up)
            let existingEditor = this.parentNode.querySelector(`.brainsatplay-node-editor`)
            if (!existingEditor && this.parentNode.parentNode) existingEditor = this.parentNode.parentNode.querySelector(`.brainsatplay-node-editor`)
            if (!existingEditor && this.parentNode.parentNode.parentNode) existingEditor = this.parentNode.parentNode.parentNode.querySelector(`.brainsatplay-node-editor`)
            if (existingEditor) existingEditor.remove()

            let template = () => {
                return `
                <div id="${this.props.id}GraphEditorMask" class="brainsatplay-default-container brainsatplay-node-editor">
                    <div id="${this.props.id}MainPage" class="main">
                        <div class="brainsatplay-node-editor-preview-wrapper">
                            <div id="${this.props.id}preview" class="brainsatplay-node-editor-preview"></div>
                        </div>
                        <div id="${this.props.id}ViewTabs" class="brainsatplay-node-editor-tabs">
                        </div>
                        <div id="${this.props.id}NodeVieweContainer" class="brainsatplay-node-viewer">
                            <div id="${this.props.id}NodeViewer" class="brainsatplay-node-viewer grid">
                            </div>
                        </div>
                    </div>
                    <div id="${this.props.id}GraphEditor" class="brainsatplay-node-sidebar">
                        <div>
                            <div class='node-sidebar-section'>
                                <h3>Projects</h3>
                            </div>
                            <div id="${this.props.id}projects" class='node-sidebar-content'>
                            </div>
                            <div class='node-sidebar-section'>
                                <h3>Project Info</h3>
                            </div>
                            <div id="${this.props.id}settings" class='node-sidebar-content'>
                            </div>
                            <div class='node-sidebar-content' style="display: flex; flex-wrap: wrap; padding: 10px;">
                                <button id="${this.props.id}download" class="brainsatplay-default-button">Download Project</button>
                                <button id="${this.props.id}reload" class="brainsatplay-default-button">Reload Project</button>
                                <button id="${this.props.id}save" class="brainsatplay-default-button">Save Project</button>
                                <button id="${this.props.id}publish" class="brainsatplay-default-button">Publish Project</button>
                                <button id="${this.props.id}exit" class="brainsatplay-default-button">Exit the Studio</button>
                            </div>
                            <div class='node-sidebar-section'>
                                <h3>Node Editor</h3>
                                <button id="${this.props.id}add" class="brainsatplay-default-button addbutton">+</button>
                            </div>
                            <div id="${this.props.id}params" class='node-sidebar-content'>
                            <p></p>
                            </div>
                        </div>
                        <div>
                            <div id="${this.props.id}params" class='node-sidebar-content' style="display: flex; flex-wrap: wrap; padding-top: 10px;">
                                <button id="${this.props.id}edit" class="brainsatplay-default-button">Edit Node</button>
                                <button id="${this.props.id}delete" class="brainsatplay-default-button">Delete Node</button>
                            </div>
                        </div>
                    </div>
                </div>
                `
            }
    
            let setup = async () => {
                this.container = document.getElementById(`${this.props.id}GraphEditorMask`)
                this.isStudio = document.getElementById('brainsatplay-studio') != null


                // Setup Presentation Based On Settings
                if (this.app.info.editor.style) this.container.style = this.app.info.editor.style 
                let toggleClass = `.option-brainsatplay-visual-editor`
                let toggle = this.app.AppletHTML.node.querySelector(toggleClass)

                // Insert Projects
                this.insertProjects()

                // Publish Button
                let publishButton = document.getElementById(`${this.props.id}publish`)
                publishButton.onclick = () => {
                    this.app.updateGraph()
                    this.app.session.projects.publish(this.app)
                }
                publishButton.classList.add('disabled')

                // Search for Toggle
                let tries = 0
                let checkToggle = () => {
                    if (tries < 10){
                        if (this.app.AppletHTML){
                            // Grab
                            if (!toggle && this.app.AppletHTML.node.parentNode) toggle = this.app.AppletHTML.node.parentNode.querySelector(toggleClass)
                            if (!toggle && this.app.AppletHTML.node.parentNode.parentNode) toggle = this.app.AppletHTML.node.parentNode.parentNode.querySelector(toggleClass)
                            if (this.app.info.editor.toggleId) toggle = document.getElementById(this.app.info.editor.toggleId)        
                            
                            // Try Clicking
                            if (toggle) toggle.addEventListener('click', () => {this.toggleDisplay()})
                            else {
                                setTimeout(() => {checkToggle()},500)
                                tries++
                            }
                        } else {
                            tries = 11
                        }
                    } 
                    // else console.warn('toggle not available')
                }

                checkToggle()

                this.mainPage = document.getElementById(`${this.props.id}MainPage`)
                this.preview = this.mainPage.querySelector('.brainsatplay-node-editor-preview')
                this.sidebar = document.getElementById(`${this.props.id}GraphEditor`)
                document.getElementById(`${this.props.id}edit`).style.display = 'none'
                document.getElementById(`${this.props.id}delete`).style.display = 'none'

                let download = document.getElementById(`${this.props.id}download`)
                download.onclick = () => {
                    this.app.session.projects.download(this.app)
                }

                let reload = document.getElementById(`${this.props.id}reload`)
                reload.onclick = () => {
                    applet.reload()
                }

                let exit = document.getElementById(`${this.props.id}exit`)
                exit.onclick = () => {
                    // If Inside Studio, Bring Back UI
                    if (this.isStudio){
                        document.getElementById('applet-browser-button').click()
                        // let projectWindow = document.getElementById('brainsatplay-studio').querySelector('.projects')
                        // projectWindow.style.opacity = 1
                        // projectWindow.style.pointerEvents = 'all'

                    } else { // Otherwise just toggle the editor display
                        this.toggleDisplay()
                    }
                }


                this.viewer = document.getElementById(`${this.props.id}NodeViewer`)

                // Insert Node Selector with Right Click
                this.toggleContextMenuEvent(this.viewer)

                // Add Settings Editor
                this.createSettingsEditor(applet.info)

                // Scale View of Graph

                let relXParent, relYParent
                let relX, relY
                let translation = {x: 0, y:0}
                let mouseDown
                this.viewer.parentNode.addEventListener('mousedown', e => {mouseDown = true} )
                window.addEventListener('mouseup', e => { mouseDown = false} )

                this.viewer.parentNode.addEventListener('mousemove', e => {
                    if (this.editing === false){

                        // Transform relative to Parent
                        let rectParent = e.target.parentNode.getBoundingClientRect();
                        let curXParent = (e.clientX - rectParent.left)/rectParent.width; //x position within the element.
                        let curYParent = (e.clientY - rectParent.top)/rectParent.height;  //y position within the element.
                    
                        if (mouseDown){
                            let tX = (curXParent-relXParent)*rectParent.width
                            let tY = (curYParent-relYParent)*rectParent.height

                            if (!isNaN(tX) && isFinite(tX)) translation.x += tX
                            if (!isNaN(tY) && isFinite(tY)) translation.y += tY
                            updateUI()
                        } 
                        // else {
                        //     // Grab Target Coords for Scaling
                        //     let rect = e.target.getBoundingClientRect();
                        //     // let rect = this.viewer.getBoundingClientRect()
                        //     let p1 = {x: e.clientX, y: e.clientY}
                        //     let position = this.mapPositionFromScale(p1, rect)
                        //     console.log({x: e.clientX, y: e.clientY}, position)
                        //     this.viewer.style['transformOrigin'] = `${position.x}px ${position.y}px`;
                        // }
                        relXParent = curXParent
                        relYParent = curYParent
                    }
                })

                let updateUI = () => {
                    this.viewer.style['transform'] = `translate(${translation.x}px, ${translation.y}px) scale(${this.context.scale*100}%)`
                }

                // Change scale
                this.viewer.parentNode.addEventListener('wheel', (e)=>{
                    this.context.scale += 0.01*-e.deltaY
                    if (this.context.scale < 0.5) this.context.scale = 0.5 // clamp
                    if (this.context.scale > 3.0) this.context.scale = 3.0 // clamp
                    updateUI()

                    for (let key in this.graph.nodes){
                        this.graph.nodes[key].updateAllEdges()
                    }
                })
                
                // Search for Plugins
                this.createPluginSearch(this.mainPage)

                // Create Tabs
                this.createViewTabs()

                // Add Graph Tab and Save Functionality
                this.addGraphTab()

                // Populate Used Nodes and Edges
                this.graph = new Graph(this.viewer)


                // Setup Nodes
                let i = 0
                let length = Object.keys(this.plugins.nodes).length
                this.plugins.nodes.forEach(n => {
                    let node = this.addNode(n,true, true, true) 
        
                    // Default Positioning
                    let iterator = Math.ceil(Math.sqrt(length))
                    let row = Math.floor(i % iterator)
                    let col = Math.floor(i/iterator)
        
                    let padding = 10
                    let availableSpace = 100 - 2*padding
                    let leftShift = 0.5 * availableSpace/(iterator+1)
                    let downShift = 0.5 * availableSpace/(iterator+2)
                    
                    if (!n.style.includes('top') && !n.style.includes('left')) {
                        node.element.style.top = `${padding + downShift + availableSpace*row/iterator}%`
                        node.element.style.left = `${padding + leftShift + availableSpace*col/iterator}%`
                        i++
                    }
                })

                // Setup Edges
                await this.graph.initEdges(this.plugins.edges)

                // Add Edge Reactivity
                this.graph.edges.forEach(e => {
                    this.addEdgeReactivity(e)
                })

                onsuccess(this)
            }
    
            this.element = new DOMFragment(
                template,
                this.parentNode,
                undefined,
                setup
            )
        }


        window.addEventListener('resize', this.responsive)

    }

    _onMouseOverEdge = (e) => {
        e.node['curve'].style.opacity = 0.3
    }

    _onMouseOutEdge = (e) => {
        e.node['curve'].style.opacity = 1
    }
    _onClickEdge = (e) => {
        this.removeEdge(e)
    }

    addEdgeReactivity = (e) => {
        e.node['curve'].addEventListener('mouseover', () => {this._onMouseOverEdge(e)})
        e.node['curve'].addEventListener('mouseout', () => {this._onMouseOutEdge(e)})
        e.node['curve'].addEventListener('click', () => {this._onClickEdge(e)})
    }

    insertProjects = async () => {

        this.props.projectContainer = document.getElementById(`${this.props.id}projects`)
        this.props.projectContainer.style.padding = '0px'
        this.props.projectContainer.style.display = 'block'

        let galleries = {}
        galleries['My Projects'] = []

        // Get Project Settings Files
        let projectSet = await this.app.session.projects.list()
        for (let key in projectSet) {
            projectSet[key] = Array.from(projectSet[key])
        }

        let length = projectSet.local.length
        let projects = Array.from({length}, e => new Promise(()=> {})) 
        for(let i=0;i<projectSet.local.length;i++) {
            let str = projectSet.local[i]
            let files = await this.app.session.projects.getFilesFromDB(str)
            let settings =  await this.app.session.projects.load(files)
            projects[i] = {destination: 'My Projects', settings}
        }

        // Get Template Files
        let templateSet = []

        // if (this.local){
        try {
            for (let key in appletManifest){
                let o = appletManifest[key]
                let settings = await getAppletSettings(o.folderUrl)
                if (settings.graph) {
                    if (o.folderUrl.includes('/Templates')) templateSet.push({destination: 'Templates', settings})
                    else templateSet.push({destination: 'Examples', settings})
                }
            }
        } catch (e) {console.log('Applets not found', e)}
        // }

        Promise.allSettled([...projects,...templateSet]).then(set => {

            let restrictedTemplates = ['BuckleUp', 'Analyzer', 'Brains@Play Studio', 'One Bit Bonanza', 'Applet Browser']
            set.forEach(o => {
                if (o.status === 'fulfilled' && o.value.settings){
                    if (!restrictedTemplates.includes(o.value.settings.name)) {
                        if (galleries[o.value.destination] == null) galleries[o.value.destination] = []
                        
                        galleries[o.value.destination].push(o.value.settings)
                    }
                }
            })

            // Add Load from File Button
            galleries['My Projects'].unshift({name: 'Load from File'})

            let galleryKeys = ['My Projects', 'Templates', 'Examples'] // Specify ordering

            let lastClickedProjectCategory = ''
            galleryKeys.forEach(k => {

                let projectArr = galleries[k]

                if (projectArr){

                    // Create Top Header
                    if (k !== 'My Projects'){
                        let div = document.createElement('div')
                        div.classList.add(`brainsatplay-option-type`) 
                        div.classList.add(`option-type-collapsible`)
                        div.innerHTML = k
                        this.addDropdownFunctionality(div)
                        this.props.projectContainer.insertAdjacentElement('beforeend', div)
                    }

                    // Create Project List
                    let projects = document.createElement('div')
                    projects.id = `${this.props.id}-projectlist-${k}`
                    projects.classList.add("option-type-content")
                    this.props.projectContainer.insertAdjacentElement(`beforeend`, projects)

                    projectArr.forEach(settings => {

                        // Set Experimental Version on Example Projects
                        if (k != 'My Projects') settings.version = 'experimental'

                        let item = document.createElement('div')
                        item.innerHTML = settings.name
                        item.classList.add('brainsatplay-option-node')
                        item.style.padding = '10px 20px'
                        item.style.display = 'block'

                        item.onclick = async () => {
                            
                            // Rename Template Projects
                            if (k !== 'My Projects'){
                                settings = Object.assign({}, settings)
                                if (settings.name === 'Blank Project') settings.name = 'My Project'
                            }

                            // Create Application
                            if (settings.name === 'Load from File') {
                                settings = await this.app.session.projects.loadFromFile()
                                this._createApp(settings)
                            } else {
                                if (((this.lastSavedProject === this.app.info.name) || lastClickedProjectCategory == 'My Projects') && k === 'My Projects' && this.app.info.name === settings.name) this._createApp(this.app.info)
                                else this._createApp(settings)
                            }
                        // }
                        lastClickedProjectCategory = k

                        }
                        if (settings.name === 'Blank Project' || settings.name === 'Load from File'){
                            // div.style.flex = '43%'
                            projects.insertAdjacentElement('afterbegin',item)
                        } else {projects.insertAdjacentElement('beforeend',item)}

                    })

                    if (k === 'My Projects') projects.style.maxHeight = projects.scrollHeight + "px"; // Resize personal projects
                }
            })
        })
    }

    _createApp(settings){

        settings.editor = {
            parentId: this.app.parentNode,
            show: true,
            style: `
            position: block;
            z-index: 9;
            `,
        }

        this.app.replace(settings)
    }

    createViewTabs = () => {

        let parentNode = document.getElementById(`${this.props.id}ViewTabs`)

        // Add Tab Div
        let tabs = document.createElement('div')
        tabs.classList.add('tab')
        parentNode.insertAdjacentElement('afterbegin', tabs)
    }

    addGraphTab(){
        this.files['Graph Editor'] = {}
        this.files['Graph Editor'].container = this.viewer
        this.files['Graph Editor'].tab = this.addTab('Graph Editor', this.viewer.parentNode.id)
        let save = document.getElementById(`${this.props.id}save`)
        let onsave = () => {
            this.files['Graph Editor'].tab.classList.remove('edited')
            this.app.updateGraph()
            this.app.session.projects.save(this.app)
            this.lastSavedProject = this.app.info.name
        }
        save.onclick = onsave
        this.saveFileEvent('Graph Editor', onsave)
    }

    saveFileEvent = (filename, onsave) => {
        this.files[filename].saveEvent = (e) => {
            if (this.files[filename].container.offsetParent != null){
                if ((window.navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey)  && e.keyCode == 83) {
                    e.preventDefault();
                    onsave()
                }
            }
        }
        window.addEventListener('keydown', this.files[filename].saveEvent)
    }

    addCloseIcon(parent, callback){
        let closeIcon = document.createElement('div')
        closeIcon.classList.add('closeIcon')

        if (callback){
            closeIcon.innerHTML = 'x'
            closeIcon.onclick = () => {
                callback()
            }
        }

        if (parent.style.position != 'absolute') parent.style.position = 'relative'
        parent.insertAdjacentElement('beforeend', closeIcon)
    }

    addTab(label, id=String(Math.floor(Math.random()*1000000)), onOpen=()=>{}){
        let tab = document.querySelector(`[data-target="${id}"]`);
        if (tab == null){
            tab = document.createElement('button')
            tab.classList.add('tablinks')
            tab.setAttribute('data-target', id)
            tab.innerHTML = label

            if (label != 'Graph Editor'){
                let onClose = () => {
                    tab.style.display = 'none'
                    let editorTab = document.querySelector(`[data-target="${this.viewer.parentNode.id}"]`);
                    editorTab.click()
                }
                this.addCloseIcon(tab,onClose)
            } else {
                this.addCloseIcon(tab)
            }

            tab.onclick = () => {

                if (tab.style.display !== 'none'){
                    // Close Other Tabs
                    let allTabs =  document.querySelector('.tab').querySelectorAll('.tablinks')
                    for (let otherTab of allTabs){
                        let tabId = otherTab.getAttribute('data-target')
                        let target = document.getElementById(tabId)
                        if(id != tabId) {
                            if (target) target.style.display = 'none'
                            otherTab.classList.remove('active')
                        } else {
                            if (target) target.style.display = ''
                            otherTab.classList.add('active')
                            onOpen()
                        }
                    }
                    this.responsive()
                }
            }

            document.querySelector('.tab').insertAdjacentElement('beforeend', tab)
            this.responsive()
        }
        this.clickTab(tab)
        return tab
    }

    clickTab = (tab) => {
        if (tab.style.display === 'none') tab.style.display = ''
        tab.click()
    }

    toggleContextMenuEvent = (el) => {
        el.addEventListener('contextmenu', (ev) =>{
            ev.preventDefault();
            this.nextNode = {
                position: {
                    x: ev.clientX,
                    y: ev.clientY
                }
            }
            // alert('success!');
            this.selectorToggle.click()
            return false;
        }, false);
    }

    createSettingsEditor(settings){
            let settingsContainer = document.getElementById(`${this.props.id}settings`)

            let toParse ={}

            let dummySettings = {
                name: "",
                devices: [""],
                author: "",
                description: "",
                categories: [],
                instructions: "",
                image: null,
                version: this.app.session.projects.version,

                display: {
                  production: false,
                  development: false
                },

                intro: {
                    title: false,
                    mode: 'solo', // 'solo', 'multiplayer'
                    login: null,
                    domain: null,
                    session: null,
                    spectating: false,
                },

                // editor: {
                //     create: false,
                //     parentId: null,
                //     show: false,
                //     style: '',
                // },

                connect: {
                    filter:[],
                    toggle: '',
                    onconnect: () => {}
                },
            
                // App Logic
                // graph:
                // {
                //   nodes: [],
                //   edges: []
                // },
            }

            let inputDict = {}
            Object.keys(dummySettings).forEach(key => {
                if (settings[key] == null) settings[key] = dummySettings[key]
                toParse[key] = {data: settings[key]}
                toParse[key].input =  {type: typeof settings[key]}

                switch(key){
                    case 'image':
                        toParse[key].input =  {type: 'file', accept: 'image/*'}
                        break
                    case 'instructions':
                        toParse[key].input =  {type: 'HTML'}
                        break    
                    default:
                        let type = typeof settings[key]
                        if (type === 'object') if (Array.isArray(settings[key])) type = Array
                        toParse[key].input =  {type}
                }

                let includeButDontShow = ['display', 'version']
                 
                if (!includeButDontShow.includes(key)){
                    let {container, input} = this.createInput(toParse, key)
                    if (container) {
                        settingsContainer.insertAdjacentElement('beforeend', container)
                        inputDict[key] = input
                    }
                }
            })

            this.subscribeToChanges(inputDict,toParse, 'settings')

            delete this.state.data[`activeSettingsFile`]
            this.state.addToState(`activeSettingsFile`, settings, () => {
                if (this.files['Graph Editor'].tab) this.files['Graph Editor'].tab.classList.add('edited')
            })


        }


    toggleDisplay(){
        if (this.element){
            if (this.element.node.style.opacity == 0){
                this.element.node.style.opacity = 1
                this.element.node.style.pointerEvents = 'auto'
                this.shown = true

                // Move App Into Preview
                this.appNode = this.app.AppletHTML.node
                this.preview.appendChild(this.appNode)
                setTimeout(() => {

                this.responsive()
                this.manager._resizeAllNodeFragments(this.app.props.id)
                },100)
            } else {
                this.element.node.style.opacity = 0
                this.element.node.style.pointerEvents = 'none'
                this.shown = false

                this.app.AppletHTML.parentNode.appendChild(this.appNode)
                setTimeout(() => {
                    this.responsive()
                    this.manager._resizeAllNodeFragments(this.app.props.id)
                },100)
            }
        }
    }

    removeEdge(e, ignoreManager=false){
        this.graph.removeEdge(e)
        if (!ignoreManager) this.manager.removeEdge(this.app.props.id, e.structure)
    }


    animate(source,target,latencyArr){
        if (this.shown){
            if (latencyArr) {
                latencyArr.forEach(o => {
                    this.animateLatency(o.node,o.port,o.latency)
                })
            }
            this.animateNode(source,'source')
            this.animateNode(target,'target')
            this.animateEdge(source,target)
        }
    }
    
    getColorfromMap = (pct, map) => {
        for (var i = 1; i < map.length - 1; i++) {
            if (pct < map[i].pct) {
                break;
            }
        }
        var lower = map[i - 1];
        var upper = map[i];
        var range = upper.pct - lower.pct;
        var rangePct = (pct - lower.pct) / range;
        var pctLower = 1 - rangePct;
        var pctUpper = rangePct;
        var color = {
            r: Math.floor(lower.color.r * pctLower + upper.color.r * pctUpper),
            g: Math.floor(lower.color.g * pctLower + upper.color.g * pctUpper),
            b: Math.floor(lower.color.b * pctLower + upper.color.b * pctUpper)
        };
        return 'rgb(' + [color.r, color.g, color.b].join(',') + ')';
        // or output as hex if preferred
    };

    animateLatency(node, port, latency){
        let instance = this.graph.nodes[node.label]
        let pct = Math.min(1,latency/1)

        let map = [
            { pct: 0.0, color: { r: 0x39, g: 0xff, b: 0x14 } },
            { pct: 0.5, color: { r: 0xfa, g: 0xed, b: 0x27 } },
            { pct: 1.0, color: { r: 0xff, g: 0x14, b: 0x39 } } 
        ];
        
        let el = instance.portLabels.querySelector(`.latency-display[name="${port}"]`)
        el.style.width = `${pct*100}%`
        el.style.background = this.getColorfromMap(pct, map)
    }

    animateNode(node,type){
        let instance = this.graph.nodes[node.label]
        if (instance){
            let portEl = instance.element.querySelector(`.${type}-ports`).querySelector(`.port-${node.port}`)
            if (portEl) {
                portEl.classList.add('updated')
                portEl.setAttribute('data-update', Date.now())
                setTimeout(()=>{
                    if (portEl.getAttribute('data-update') < Date.now() - 450){
                        portEl.classList.remove('updated')
                    }
                }, 500)
            }
        }
    }

    animateEdge(source,target){
        let instance = this.graph.nodes[source.label]
        instance.edges.forEach(e=>{
            let splitSource = e.structure.source.split(':')
            if (splitSource.length < 2 ) splitSource.push('default')
            if(splitSource[1] === source.port){
                if (e.structure.target){
                    let splitTarget = e.structure.target.split(':')
                    if (splitTarget.length < 2 ) splitTarget.push('default')
                    if (splitTarget[0] === target.label && splitTarget[1] == target.port){
                        e.node.curve.classList.add('updated')
                        e.node.curve.setAttribute('data-update', Date.now())
                        setTimeout(()=>{
                            if (e.node.curve.getAttribute('data-update') < Date.now() - 450){
                                e.node.curve.classList.remove('updated')
                            }
                        }, 500)
                    }
                }
            }
        })
    }


    drawEdge = (p1,p2) => {
        let dict = {}
        let type = Array.from(p1.parentNode.parentNode.classList).find((str) => {
            if (str.includes('-ports')) return true
        })
        type = type.replace('-ports','')

        dict[type] = `${p1.getAttribute('data-node')}:${p1.getAttribute('data-port')}`
        
        if (p2 && p2.classList.contains('node-port')){
            let otherType = (type === 'source') ? 'target' : 'source'
            dict[otherType] = `${p2.getAttribute('data-node')}:${p2.getAttribute('data-port')}`
            this.addEdge(dict)
        } else {
            this.addEdge(dict)
        }
    }

    addEdge = async (e) => {

        if (this.files['Graph Editor'].tab) this.files['Graph Editor'].tab.classList.add('edited')

        if (e.source) e.source = e.source.replace(':default', '')
        if (e.target) e.target = e.target.replace(':default', '')
        this.editing = true
        let res = await this.graph.addEdge(e)

        if (res.msg === 'OK'){
            let edge = res.edge
            edge.structure.source = edge.structure.source.replace(':default', '')
            edge.structure.target = edge.structure.target.replace(':default', '')
            this.addEdgeReactivity(edge) 
            this.app.info.graph.edges.push(edge.structure) // Change actual settings file
            this.manager.addEdge(this.app.props.id,edge.structure)   
            this.editing = false
        } else {

            // Grab Type of Incomplete Port
            for (let key in res.edge.structure) for (let cls of res.edge[`${key}Node`].classList) if (cls.includes('type-')) this.search.value = cls.replace('type-','')
            this.matchOptions()
            this.selectorToggle.click()
        }

    }

    // updatePorts(node){
    //     let n = this.graph.nodes[node.label]
    //     if (n) {
    //         n.updatePorts(node)
    //         this.addPortEvents(n)
    //     }
    // }
    
    removePort(node,port){
        let n = this.graph.nodes[node.label]
        if (n) n.removePort(port)
    }

    addPort(node,port){
        let n = this.graph.nodes[node.label]
        if (n){
            n.addPort(port)
            this.addPortEvents(n)
        }
    }

    removePort(node,port){
        this.graph.nodes[node.label].removePort(port)
    }

    addNode(nodeInfo, skipManager = false, skipInterface = false, skipClick=false){
        
        
        if (this.files['Graph Editor'].tab) this.files['Graph Editor'].tab.classList.add('edited')

        if (nodeInfo.id == null) nodeInfo.id = nodeInfo.class.id
        if (skipManager == false) nodeInfo = this.manager.addNode(this.app, nodeInfo)
        if (skipInterface == false) this.app.insertInterface(nodeInfo)
        let node = this.graph.addNode(nodeInfo)

        let top
        let left
        if (nodeInfo.style){
            top = nodeInfo.style.match(/top: ([^;].+); /)
            left = nodeInfo.style.match(/left: ([^;].+);\s?/)
        }

        dragUtils.dragElement(this.graph.parentNode,node.element, this.context, () => {node.updateAllEdges()}, () => {this.editing = true}, () => {
            this.editing = false
            node.nodeInfo.style = node.element.style.cssText
        })

        if (skipManager == false) this.app.info.graph.nodes.push(nodeInfo) // Change actual settings file
        this.addNodeEvents(this.graph.nodes[nodeInfo.id])
        this.addPortEvents(this.graph.nodes[nodeInfo.id])

        if (!skipClick) node.element.querySelector('.brainsatplay-display-node').click()

        // Place Node if Location is Provided
        if (top || left){
            if (top) node.element.style.top = top[1]
            if (left) node.element.style.left = left[1]
        } else if (this.nextNode) {
            let rect = this.viewer.getBoundingClientRect()
            let position = this.mapPositionFromScale(this.nextNode.position, rect)
            node.element.style.top = `${position.x}px`
            node.element.style.left = `${position.y}px`
            this.nextNode = null
        }

        node.nodeInfo.style = node.element.style.cssText // Set initial translation

        return node
    }

    mapPositionFromScale = (position, rect) => {
        let relYPx = (position.y - rect.top)
        let relXPx = (position.x - rect.left)
        let relYPctMapped = (relYPx / rect.height) * (1/this.context.scale)
        let relXPctMapped = (relXPx / rect.width) * (1/this.context.scale)
        position.x = relYPctMapped * rect.height
        position.y = relXPctMapped * rect.width
        for (let key in position){
            if (isNaN(position[key])) position[key] = 0
        }
        
        return position
    }

    addNodeEvents(node){
        let nodeElement = node.element.querySelector('.brainsatplay-display-node')

        nodeElement.onclick = () => {
            let clickedNode = this.graph.parentNode.querySelector('.clicked')
            if (clickedNode) clickedNode.classList.remove('clicked')
            nodeElement.classList.add('clicked')

            // Plugin GUI
            let selectedParams = document.getElementById(`${this.props.id}params`)
            selectedParams.innerHTML = ''
            let plugin = node.nodeInfo.instance
            let toParse = plugin.ports


            let inputDict = {}
            for (let key in toParse){
                let {container, input} = this.createInput(plugin.ports, key, plugin)
                if (container) {
                    inputDict[key] = input
                    selectedParams.insertAdjacentElement('beforeend', container)
                }
            }

            this.subscribeToChanges(inputDict,toParse, 'ports', plugin)


            // Edit and Delete Buttons
            document.getElementById(`${this.props.id}delete`).style.display = ''
            document.getElementById(`${this.props.id}delete`).onclick = () => {
                this.removeNode(node.nodeInfo)
            }
            let edit = document.getElementById(`${this.props.id}edit`)
            let editable = this.app.session.projects.checkIfSaveable(node.nodeInfo.class)

            if (editable){
                edit.style.display = ''
                edit.onclick = (e) => {
                this.createFile(node.nodeInfo.class)
            }} else edit.style.display = 'none'
        }
    }

    createInput(toParse, key, plugin){

        // Properly Nest Divs
        let container = document.createElement('div')
        container.insertAdjacentHTML('beforeend',`<div><p>${key}</p></div>`)
        let inputContainer = document.createElement('div')
        inputContainer.style.position = 'relative'

        // Sort through Params
        if (toParse[key].edit != false){

            let defaultType
            if (toParse[key].output?.type === null) defaultType = toParse[key].input?.type // Input if output is null
            else if (toParse[key].output?.type === undefined) defaultType = typeof toParse[key].data // Data type if output is undefined
            else defaultType = toParse[key].output?.type // Otherwise specified output type

            if (typeof defaultType !== 'string' && defaultType?.name) defaultType = defaultType.name

            let specifiedOptions = toParse[key].options
            let optionsType = typeof specifiedOptions

            let input

            // Filter out elements
            defaultType = (defaultType === "object" ? toParse[key].data instanceof HTMLElement : toParse[key].data && typeof toParse[key].data === "object" && toParse[key].data !== null && toParse[key].data.nodeType === 1 && typeof toParse[key].data.nodeName==="string") ? 'Element' : defaultType

        // Cannot Handle Objects or Elements
        if (defaultType != 'undefined' && defaultType != 'Element'){
            if (optionsType == 'object' && specifiedOptions != null){
                    let options = ``
                    toParse[key].options.forEach(option => {
                        let attr = ''
                        if (option === toParse[key].data) attr = 'selected'
                        options += `<option value="${option}" ${attr}>${option}</option>`
                    })
                    input = document.createElement('select')
                    input.innerHTML = options
            } else if (defaultType === 'Array'){

                if (!Array.isArray(toParse[key].data)) toParse[key].data = []

                let container = document.createElement('div')
                container.style.width = '100%'
                container.style.fontSize = `75%`
                
                let insertOption = (v) => {
                    let option = document.createElement('div')
                    option.style.padding = '6px 0px'
                    option.innerHTML = v
                    this.addCloseIcon(option, () => {
                        option.remove()
                        toParse[key].data.find((val,i) => {
                            if (val === v){
                                toParse[key].data.splice(i,1)
                            }
                        })
                    })
                    container.insertAdjacentElement('beforeend',option)
                }

                input = document.createElement('div')
                input.style.width = '100%'

                toParse[key].data.forEach(v => {
                    insertOption(v)
                })

                let div = document.createElement('div')
                div.style= `
                    display: flex;
                    align-items: center;
                    width: 100%;
                    flex-grow: 0;
                `

                let textInput = document.createElement('input')
                textInput.type = 'text'
                textInput.placeholder = 'Add tag'

                let button = document.createElement('button')
                button.classList.add('brainsatplay-default-button')
                button.classList.add('addbutton')
                button.innerHTML = `+`
                button.onclick = () => {
                    let set = new Set(toParse[key].data)
                    if (!set.has(textInput.value)){
                        insertOption(textInput.value)
                        toParse[key].data.push(textInput.value)
                    }
                    textInput.value = ''
                }

                div.insertAdjacentElement('beforeend',textInput)
                div.insertAdjacentElement('beforeend',button)
                input.insertAdjacentElement('beforeend',container)
                input.insertAdjacentElement('beforeend',div)


            } else if (defaultType === 'object'){
                input = document.createElement('textarea')
                input.value = JSON.stringify(toParse[key].data, null, '\t')
            } else if (defaultType === 'boolean'){
                input = document.createElement('input')
                input.type = 'checkbox'
                input.checked = toParse[key].data
            } else if (defaultType === 'number'){
                if ('min' in toParse[key] && 'max' in toParse[key]){
                    input = document.createElement('input')
                    input.type = 'range'
                    input.min = toParse[key].min
                    input.max = toParse[key].max
                    if (toParse[key].step) input.step = toParse[key].step
                    let output = document.createElement('output')
                    inputContainer.insertAdjacentElement('afterbegin',output)
                    input.value = toParse[key].data
                    output.innerHTML = input.value
                } else {
                    input = document.createElement('input')
                    input.type = 'number'
                    input.value = toParse[key].data
                }
            } else if (['Function', 'HTML', 'CSS', 'GLSL'].includes(defaultType)){
                input = document.createElement('button')
                input.classList.add('brainsatplay-default-button')
                input.style.width = 'auto'
                input.innerHTML = `Edit ${defaultType}`
                
                let container = document.createElement('div')
                container.style = `
                    width: 75vw;
                    height: 75vh;
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    z-index: 1000;
                    transform: translate(-50%, -50%)
                `
                
                document.body.insertAdjacentElement('beforeend', container)
                let settings = {}
                settings.onOpen = (res) => {
                    container.style.pointerEvents = 'all'
                    container.style.opacity = '1'
                }
    
                settings.onSave = (res) => {
                    // if (defaultType === 'Function') res = res[key]
                    // plugin.ports[key].data
                    if (plugin) this.setPort(plugin, key, res)
                   this.manager._resizeAllNodeFragments(this.app.props.id)
                }
    
                settings.onClose = (res) => {
                    container.style.pointerEvents = 'none'
                    container.style.opacity = '0'
                }

                if (defaultType === 'Function'){
                    settings.language = 'javascript'
                } else {
                    settings.language = defaultType.toLowerCase()
                }

                settings.target = toParse[key]
                settings.key = 'data'

                settings.onClose()

                let editor
                input.onclick = () => {
                    if (editor == null) editor = new LiveEditor(settings, container)
                    else settings.onOpen()
                }
            } else if (defaultType === 'file'){
                
                let text = 'Choose File'
                input = document.createElement('input')
                input.type = 'file'
                input.accept = toParse[key].input?.accept // Only in new format

                if (toParse[key].input?.multiple){
                    input.multiple = true // Only in new format
                    text = text + 's'
                }
                input.style.display = 'none'

                // Add image display
                let button = document.createElement('button')
                let img = document.createElement('img')
                button.classList.add('brainsatplay-default-button')
                button.innerHTML = text
                button.style.width = 'auto'

                if (input.accept.includes('image')){
                    img.style = `
                        max-width: 50%;
                        cursor: pointer;
                    `

                    input.addEventListener('input', () => {
                        let file = input.files[0]
                        if (file){
                            var reader = new FileReader();
                            reader.onloadend = () => {
                                toParse[key].data = reader.result
                                if (toParse[key].data) {
                                    img.src = toParse[key].data
                                    img.style.display = ''
                                    button.style.display = 'none'
                                } else {
                                    img.style.display = 'none'
                                    button.style.display = ''
                                }
                            }
                            reader.readAsDataURL(file);
                        }
                    })
                
                if (toParse[key].data != null){
                    img.src = toParse[key].data
                    img.style.display = ''
                    button.style.display = 'none'
                } else {
                    img.style.display = 'none'
                    button.style.display = ''
                }
                inputContainer.insertAdjacentElement('beforeend',img)
            } 
                inputContainer.insertAdjacentElement('beforeend',button)

                img.onclick = button.onclick = () => {
                    input.click()
                    button.blur()
                }
            }
            else {
                    input = document.createElement('input')
                    // Check if Color String
                    if (/^#[0-9A-F]{6}$/i.test(toParse[key].value)){
                        input.type = 'color'
                    } else {
                        input.type = 'text'
                    }
                    input.value = toParse[key].data
            }

            // Add to Document
                inputContainer.insertAdjacentElement('beforeend',input)
                container.insertAdjacentElement('beforeend',inputContainer)
                container.classList.add(`content-div`)                

                input.oninput = (e) => {
                    this.updatePortFromGUI(input, plugin, key, toParse)
                }
                return {container, input}
            } else return {}
        } else return {}
    }

    subscribeToChanges(inputDict, toParse, label='', plugin) {
        // Listen for Non-GUI Changes to Params when Viewing
        Object.keys(this.state.data).forEach(k => {
            if (k.includes(`GUI${label}_`)){
                delete this.state.data[k]
            }
        })

        let keys = Object.keys(toParse)

        keys.forEach(key => {
            this.state.addToState(`GUI${label}_${key}`, toParse[key], () => {

                let oldValue
                let newValue
                    
                    let input = inputDict[key]

                    // Filter for Displayable Inputs
                    if (input && this.elementTypesToUpdate.includes(input.tagName) && input.type != 'file'){
                        if (input.type === 'checkbox') {
                            oldValue = input.checked
                            input.checked = toParse[key].data
                            newValue = input.checked
                        }
                        else {
                            oldValue = input.value

                            if (toParse[key].data != null){ // FIX
                                input.value = toParse[key].data

                                if (input.tagName === 'TEXTAREA') {
                                    newValue = JSON.stringify(input.value, null, '\t')
                                }
                                else newValue = input.value
                            }
                        }
                    }
                    
                    if (oldValue != newValue) {
                        if (plugin) this.updatePortFromGUI(input, plugin, key, toParse)
                        if (this.files['Graph Editor'].tab) this.files['Graph Editor'].tab.classList.add('edited')
                    }
            })
        })
    }

    // Change the INTERNAL Params (running through port and setting output manually)
    updatePortFromGUI(input, plugin, key, toParse) {

        if (this.elementTypesToUpdate.includes(input.tagName)){
            if (input.tagName === 'TEXTAREA') {
                try{
                    toParse[key].data = JSON.parse(input.value)
                } catch (e) {console.warn('JSON not parseable', e)}
            }
            else if (input.type === 'checkbox') toParse[key].data = input.checked
            else if (input.type === 'file') toParse[key].data = input.files;
            else if (['number','range'].includes(input.type)) {
                let possibleUpdate = Number.parseFloat(input.value)

                if (!isNaN(possibleUpdate)) toParse[key].data = possibleUpdate
                else return

                if (input.type === 'range') {
                    input.parentNode.querySelector('output').innerHTML = input.value
                }
            }
            else toParse[key].data = input.value
            
           this.setPort(plugin,key,toParse)
            if (!['number','range', 'text', 'color'].includes(input.type) && input.tagName !== 'TEXTAREA') input.blur()
        }
    }

    setPort(plugin, key, toParse){

        let toPass = Object.assign({forceUpdate: true}, toParse[key])
        if (plugin && toParse[key] && toParse[key].onUpdate instanceof Function){
            try {
                let res = plugin.ports[key].onUpdate(toParse[key]) // Run through the port without propagating the actual output state
                if(!res.data) throw ('Asynchronous exception');
            } catch (e) {
                // console.log(e)
            }
            this.manager.setPort(plugin,key, toPass) // Set port state with the desired output
        } else {
            this.manager.setPort(plugin,key, toPass) // Set port state with the desired output
        }
    }

    createFile(target, name){
        if (name == null || name === '') name = `${target.name}`
        let filename = `${name}.js`

        let getNode = (target) => {
            return this.plugins.nodes.find(n => {
                if (n.class.id == target.id) return n
            })
        }

         let activeNode = getNode(target)
        

        if (this.files[filename] == null){
            this.files[filename] = {}

            let tab
            let settings = {}
            let container = this.createView(undefined, 'brainsatplay-node-code', '')
            settings.language = 'javascript'
            settings.onOpen = (res) => {
                container.style.pointerEvents = 'all'
                container.style.opacity = '1'
            }

            settings.onInput = () => {
                if (tab) tab.classList.add('edited')
            }

            settings.onSave = (cls) => {
                let instanceInfo = this.manager.instantiateNode({id:cls.name,class: cls})
                let instance = instanceInfo.instance
                tab.classList.remove('edited')

                if (activeNode){
                    Object.getOwnPropertyNames( instance ).forEach(k => {
                        if (instance[k] instanceof Function || k === 'params'){ // Replace functions and params
                            activeNode.instance[k] = instance[k]
                        }

                        if (k === 'ports'){
                            for (let port in instance.ports){
                                if (activeNode.instance.ports[port] == null) activeNode.instance.ports[port] = instance.ports[port]
                                else {
                                    let keys = [
                                        'default', 
                                        'options', 
                                        'meta', 
                                        'input', 
                                        'output', 
                                        'onUpdate'
                                    ]

                                    let typeKeys = [
                                        'input', 
                                        'output',
                                    ]
                                    
                                    keys.forEach(str => {
                                        if (!typeKeys.includes(str)) activeNode.instance.ports[port][str] = instance.ports[port][str]
                                        else {
                                            activeNode.instance.ports[port][str]['type'] = instance.ports[port][str]['type']
                                        }
                                    })
                                }
                            }
                        }
                    })

                    // Set New Class
                    activeNode.class = cls
                }
                cls.id = container.id // Assign a reliable id to the class
                target = cls // Update target replacing all matching nodes
            }

            settings.onClose = (res) => {
                container.style.pointerEvents = 'none'
                container.style.opacity = '0'
            }

            settings.target = target
            settings.className = name
            settings.shortcuts = {
                save: true
            }
            settings.showClose = false

            let editor = new LiveEditor(settings,container)
            tab = this.addTab(filename, container.id, settings.onOpen)
            this.files[filename].container = container
            this.files[filename].tab = tab
            this.files[filename].editor = editor

            let onsave = () => {
                this.files[filename].editor.save()
            }

            this.saveFileEvent(filename, onsave)

            if (activeNode == null){
                onsave()
                this.clickTab(this.files['Graph Editor'].tab)
                this.addNode({class:target})
                activeNode = getNode(target)
            }

            // Add Option to Selector
            this.addNodeOption({id:target.id, label: target.name, class:target}, null, () => {
                this.addNode({class:target})
                this.selectorToggle.click()
            })

        } else {
            this.clickTab(this.files[filename].tab)
        }
    }

    createView(id=String(Math.floor(Math.random()*1000000)), className, content){
        let view = document.createElement('div')
        view.id = id
        view.className = className
        view.innerHTML = content
        this.mainPage.insertAdjacentElement('beforeend',view)
        return view
    }

    addPortEvents(node){
        let portElements = node.element.querySelectorAll('.node-port')

        for (let portElement of portElements){
            // Listen for clicks to draw SVG edge
            portElement.onpointerdown = (e) => {
                this.drawEdge(portElement)
            }
        }
    }

    removeNode = (nodeInfo) => {
        this.manager.remove(this.app.props.id, nodeInfo.class.id, nodeInfo.instance.label)
        this.graph.removeNode(nodeInfo)
    }
 

    createPluginSearch = async (container) => {
        let selector = document.createElement('div')
        selector.id = `${this.props.id}nodeSelector`
        selector.style.opacity = '0'
        selector.style.pointerEvents = 'none'
        selector.classList.add(`brainsatplay-node-selector`)

        this.selectorMenu = document.createElement('div')
        this.selectorMenu.classList.add(`brainsatplay-node-selector-menu`)

        this.selectorToggle = document.getElementById(`${this.props.id}add`)

        let toggleVisibleSelector = (e) => {
            if(!e.target.closest('.brainsatplay-node-selector-menu') && !e.target.closest(`[id="${this.props.id}add"]`)) this.selectorToggle.click()
        }

        this.selectorToggle.addEventListener('click', () => {
            if (selector.style.opacity == '1'){
                selector.style.opacity='0'
                selector.style.pointerEvents='none'
                this.search.value = ''
                this.matchOptions()
                document.removeEventListener('click', toggleVisibleSelector)
            } else {
                selector.style.opacity='1'
                selector.style.pointerEvents='all'
                document.addEventListener('click', toggleVisibleSelector)
            }
        })
        this.selectorMenu.insertAdjacentHTML('beforeend',`<input type="text" placeholder="Search"></input><div class="node-options"></div>`)
        selector.insertAdjacentElement('beforeend',this.selectorMenu)
        container.insertAdjacentElement('afterbegin',selector)

        // Populate Available Nodes
        let nodeDiv = document.createElement('div')
        this.search = this.selectorMenu.getElementsByTagName(`input`)[0]


        // Allow Search of Plugins
        this.search.oninput = (e) => {
            this.matchOptions()
        }

        this.library = await this.app.session.projects.getLibraryVersion(this.app.info.version)
        this.classRegistry = Object.assign({}, this.library.plugins)
        this.classRegistry['custom'] = {}
        let usedClasses = []

        this.addNodeOption({id:'newplugin', label: 'Add New Plugin', class: this.library.plugins.Plugin}, null, () => {
            this.createFile(this.library.plugins.Plugin, this.search.value)
            // this.addNode({class:this.library.plugins.Plugin})
            this.selectorToggle.click()
        })


        for (let type in this.classRegistry){
            let nodeType = this.classRegistry[type]

            if (typeof nodeType === 'object'){ // Skip classes
                for (let key in nodeType){
                    let cls = this.classRegistry[type][key]
                        if (!usedClasses.includes(cls.id)){
                            // let label = (type === 'custom') ? cls.name : `${type}.${cls.name}`
                            this.addNodeOption({id: cls.id, label:key, class: cls}, type, () => {
                                this.addNode({class:cls})
                                this.selectorToggle.click()
                            })
                            usedClasses.push(cls)
                        }
                }
            }
        }

        this.plugins.nodes.forEach(n => {
            let cls = n.class
            if (!usedClasses.includes(cls)){
                this.classRegistry['custom'][cls.name] = cls
                this.addNodeOption({id:cls.id, label: cls.name, class:cls}, null, () => {
                    this.addNode({class:cls})
                    this.selectorToggle.click()
                })
                usedClasses.push(cls)
            }
        })

        this.selectorMenu.insertAdjacentElement('beforeend',nodeDiv)
        this.responsive()
    }

    matchOptions = () => {
        let regex;
        try {
            regex = new RegExp(`^${this.search.value}`, 'i')
        } catch (e) {
            console.error('Invalid search value')
        }

        let matchedHeaderTypes = []

        // Show Matching Headers
        let headers = this.selectorMenu.querySelectorAll('.brainsatplay-option-type')
        for (let header of headers){
            for (let cls of header.classList){
                if (cls.includes('nodetype-')){
                    let type = cls.replace('nodetype-','')
                    let labelMatch = (regex != null) ? regex.test(type) : false
                    if (labelMatch) {
                        matchedHeaderTypes.push(type)
                    }
                }
            }
        }

        this.searchOptions.forEach(o => {

            let change = 0
            let show = false
            let parent = o.element.parentNode
            let nodetype = Array.from(o.element.parentNode.classList).find(cls => cls.includes('nodetype-'))
            nodetype = nodetype.replace('nodetype-','')

            if (this.search.value !== ''){

                if (matchedHeaderTypes.includes(nodetype)) show = true // Show header if matched
                else {
                    // Check Label
                    let labelMatch = (regex != null) ? regex.test(o.label) : false
                    if (labelMatch || o.label == 'Add New Plugin') show = true
                    
                    // Check Types
                    o.types.forEach(type => {
                        let typeMatch = (regex != null) ? regex.test(type) : false
                        if (typeMatch) show = true
                    })
                }

                if (show && o.element.style.display === 'none') {
                    o.element.style.display = ''
                    change = 1
                } else if (!show && o.element.style.display !== 'none') {
                    o.element.style.display = 'none'
                    change = -1
                }
            } else if (o.element.style.display === 'none'){
                o.element.style.display = ''
                change = 1
            }

            let count = document.querySelector(`.${o.category}-count`)
            if (count) {
                let numMatching = Number.parseFloat(count.innerHTML) + change
                count.innerHTML = numMatching

                // Open/Close Dropdown
                if (parent.previousElementSibling){
                    if (show) {
                        parent.previousElementSibling.classList.add("active");
                        parent.style.maxHeight = parent.scrollHeight + "px";
                    } else if (numMatching === 0 || this.search.value === '') {
                        parent.previousElementSibling.classList.remove('active') // Close dropdown
                        parent.style.maxHeight = null
                    }

                    // Also Show/Hide Toggle
                    if (!show && numMatching === 0) parent.previousElementSibling.style.display = 'none'
                    else parent.previousElementSibling.style.display = ''
                }
            }
        })
    }

    addNodeOption(classInfo, type, onClick){

        let id = classInfo.id
        let label = classInfo.label
        if (('class' in classInfo)) classInfo = classInfo.class

        
        let options = this.selectorMenu.querySelector(`.node-options`)
        let contentOfType = options.querySelector(`.option-type-content.nodetype-${type}`)
        if (contentOfType == null) {

            contentOfType = document.createElement('div')
            contentOfType.classList.add('option-type-content')
            contentOfType.classList.add(`nodetype-${type}`)

            if (type != null){
                let selectedType = document.createElement('div')
                selectedType.innerHTML = type[0].toUpperCase() + type.slice(1)
                selectedType.classList.add(`brainsatplay-option-type`)
                selectedType.classList.add(`option-type-collapsible`)
                selectedType.classList.add(`nodetype-${type}`)

                let count = document.createElement('div')
                count.classList.add('count')
                count.classList.add(`${type}-count`)
                count.innerHTML = 0
                selectedType.style.display = 'none' // Initialily hide the header

                selectedType.insertAdjacentElement('beforeend',count)
                options.insertAdjacentElement('beforeend',selectedType)
                this.addDropdownFunctionality(selectedType)
            }

            options.insertAdjacentElement('beforeend',contentOfType)
        }

        let element = contentOfType.querySelector(`.${label}`)
        if (element == null){
            element = document.createElement('div')
            element.classList.add("brainsatplay-option-node")
            element.classList.add(`${id}`)
            element.innerHTML = `<p>${label}</p>`
            
            element.onclick = () => {
                onClick()
                document.getElementById(`${this.props.id}add`).click() // Close menu
            }

            // element.insertAdjacentElement('beforeend',labelDiv)
            contentOfType.insertAdjacentElement('beforeend',element)

            if (classInfo.hidden && !this.local) element.remove()
            else {
                if (classInfo.hidden) element.classList.add("experimental")

                // Add Instance Details to Plugin Registry
                let types = new Set()
                let ports = this.manager.getPortsFromClass({class:classInfo})
                for(let port in ports){
                    let type = ports[port]?.input?.type
                    if (type instanceof Object) types.add(type.name)
                    else types.add(type)
                }

                this.searchOptions.push({label, element, types, category: type})
                if (type == null) contentOfType.style.maxHeight = contentOfType.scrollHeight + "px"; // Resize options without a type (i.e. not hidden)

                let count = options.querySelector(`.${type}-count`)
                let header = options.querySelector(`.nodetype-${type}`)
                if (count) {
                    count.innerHTML = Number.parseFloat(count.innerHTML) + 1
                    if (Number.parseFloat(count.innerHTML) === 0) header.style.display = 'none'
                    else header.style.display = ''
                }
            } 
        }
    }

    addDropdownFunctionality = (node) => {
        node.onclick = () => {
            node.classList.toggle("active");
            var content = node.nextElementSibling;
            if (content.style.maxHeight) content.style.maxHeight = null; 
            else content.style.maxHeight = content.scrollHeight + "px";
        }
    }



    responsive = () => {
        let selector = document.getElementById(`${this.props.id}nodeSelector`)

        if (selector){
            selector.style.height = `${selector.parentNode.offsetHeight}px`
            selector.style.width = `${selector.parentNode.offsetWidth}px`
        }

        let tabContainer = document.getElementById(`${this.props.id}ViewTabs`)
        if (tabContainer){
            let mainWidth =  this.container.offsetWidth - this.sidebar.offsetWidth
            this.mainPage.style.width = `${mainWidth}px`
            if (this.preview.innerHTML != '') {
                this.preview.style.height = `${window.innerHeight * this.mainPage.style.width/window.innerWidth}px`
                this.preview.parentNode.style.height = '100%'
            }
            else this.preview.parentNode.style.height = 'auto'
        }

        // Set Grid Width and Height (only get bigger...)
        let newWidth = this.viewer.parentNode.clientWidth
        let oldWidth = Number.parseFloat(this.viewer.style.width.replace('px',''))
        if (oldWidth < newWidth || isNaN(oldWidth)) this.viewer.style.width = `${newWidth}px`
        let newHeight = this.viewer.parentNode.clientHeight
        let oldHeight = Number.parseFloat(this.viewer.style.height.replace('px',''))
        if (oldHeight < newHeight || isNaN(oldHeight)) this.viewer.style.height = `${newHeight}px`


        if(this.graph){
            for (let key in this.graph.nodes){
                this.graph.nodes[key].updateAllEdges()
            }
        }
    }

    deinit(){
        if (this.element){
            this.element.node.style.opacity = '0'
            setTimeout(() => {this.element.node.remove()}, 500)
        }
    }
}