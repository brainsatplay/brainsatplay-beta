// Managers
import { StateManager } from './ui/StateManager'
import {GraphEditor} from './utils/graphEditor/GraphEditor'
import {plugins} from '../brainsatplay'

export class GraphManager{
    constructor(session, settings = {}){
        this.session = session

        // Centrally Manage Plugins through the Project Manager
        this.plugins = plugins
        if (this.session.projects) {
            (async() => {
                let library = await this.session.projects.getLibraryVersion(this.session.projects.version)
                this.plugins = library.plugins
            })()
        }

        // Two Modes
        this.applets = {}
        this.nodes = {}

        // Metadata
        this.settings = settings
        this.registry = {local: {}, brainstorm: {}}
        this.dependencies = []

        this.info = {
            latencies: {}
        }

        this.props = {
            toUnsubscribe: {
                stateAdded: [],
                stateRemoved: []
            },
            sequential: true
        }

        // Manage States Locally
        this.state = new StateManager()
    }

    convertNodeParamsToSaveableTypes = (node) => {
        for (let port in node.ports){
            // if (typeof node.params[port] === 'object') {
            //     if (node.params[port] instanceof Element)
            //     // if (node.params[port].constructor){
            //     //     let name = node.params[port].constructor.name
            //         if (name === 'Element') delete node.params[port] // Cannot params manually set with Element
            //     // }
            // }
            if (node.params[port] == null) {
                node.params[port] = node.ports[port].data
            }
        }
        return node.params
    }

    getPortsFromClass(nodeInfo,session=this.session) {
        let node = new nodeInfo.class(nodeInfo.id, session, nodeInfo.params)
        // node.states = {}
        return node.ports
    }


    instantiateNode(nodeInfo,session=this.session){

        // return new Promise(resolve => {

        let node = new nodeInfo.class(nodeInfo.id, session)
        let controlsToBind = []
        let toAnalyze = new Set()

        // Set Default Parameters
        this.updateParams(node, nodeInfo.params)

        // for (let param in node.paramOptions){
        //     console.log(nodeInfo, param, node.ports)
        //     if (node.ports[param].data === undefined) {
        //         node.ports[param].data = node.paramOptions[param].default
        //     }
        // }

        // node.params = this.convertNodeParamsToSaveableTypes(node)

        // Set Params to Info Object
        // nodeInfo.params = node.params
        nodeInfo.ports = node.ports

        // Add Default States
        // node.states = {}
        node.uuid = this._getRandomId()

        // Setup Info Object
        if (!(node.uuid in this.info.latencies)) {
            this.info.latencies[node.uuid] = {}
            for (let port in node.ports) this.info.latencies[node.uuid][port] = {}
        }

        if (node.ports != null){
            for (let port in node.ports){
                controlsToBind.push(...this.instantiateNodePort(node, port))
            }
        }
        
        nodeInfo.controls = controlsToBind
        if (nodeInfo.analysis == null) nodeInfo.analysis = []
        if (node.analysis) toAnalyze.add(...node.analysis)
        nodeInfo.analysis.push(...Array.from(toAnalyze))
        nodeInfo.instance = node;

        // Download Dependencies
        if ('dependencies' in node){
            node.dependencies.forEach((url,i) => {
                const script = document.createElement("script");
                script.src = url
                script.async = true;

                let promise = new Promise(resolve => {
                    script.onload = () => {
                        resolve(url)
                    }
                    document.body.appendChild(script);
                })
                node.dependencies[i] = promise
            })
        } else node.dependencies = []
        return nodeInfo
    }

    removeNode(appId,label, resize=true){
        let applet = this.applets[appId]

        let toRemove = null
        let nodeInfo = applet.nodes.find((n,i) => {
            if (n.id == label){
                toRemove = i
                return true
            }
        })
        if (toRemove != null) {
            this.removeMatchingEdges(appId, label)

            this.applets[appId].controls.options.delete(...nodeInfo.controls);

            // Update Event Registry
            this.updateApp(appId)
            nodeInfo.instance.deinit()
            if (nodeInfo.fragment) nodeInfo.fragment.deleteNode()
            applet.nodes.splice(toRemove,1)
            if (resize) this._resizeAllNodeFragments(appId)
        }
    }

    _resizeAllNodeFragments = (appId) => {
        let app =  this.applets[appId]
        if (app){
            let funcs = []
            // Gather Resize Functions
            app.nodes.forEach(n => {if ( n.fragment && n.fragment.onresize instanceof Function) funcs.push( n.fragment.onresize)})
            
            // Repeat to Scale Everything Appropriately
            funcs.forEach(f => {setTimeout(() => {funcs.forEach(f => {f()})},1)})
            funcs.forEach(f => f()) // Catch outliers
        }
    }

    _getRandomId(){
        return String(Math.floor(Math.random()*1000000))
    }

    addNode(app,nodeInfo){
        let appId = app.props.id

        // Add Basic Node Information to the Graph
        if (nodeInfo.id==null) nodeInfo.id = this._getRandomId()        

        let found = this.applets[appId].nodes.find(n => {
            if (n.id == nodeInfo.id){
                return true
            }
        })
        if (found) nodeInfo.id = nodeInfo.id + this._getRandomId()

        this.applets[appId].nodes.push(nodeInfo);
        
        // Create Node
        nodeInfo = this.instantiateNode(nodeInfo,this.session)

        // Initialize the Node
        nodeInfo.instance.stateUpdates = {}
        nodeInfo.instance.stateUpdates.manager = this.state
        nodeInfo.instance.app = app

        let node = nodeInfo.instance
                
        // Add Node to Registry
        if (this.registry.local[node.label] == null) this.registry.local[node.label] = {label: node.label, count: 0, registry: {}}
        for (let port in node.ports){
            this.addPortToRegistry(node,port)
        }
        this.registry.local[node.label].count++

        if (nodeInfo.controls.length > 0) this.applets[appId].controls.options.add(...nodeInfo.controls);

        // Grab Configure Function
        nodeInfo.configure = node.configure

        // Run Init Function and Instantiate Some Additional Nodes
        if (node.dependencies.length > 0){
            Promise.allSettled(node.dependencies).then(res => {
                this.setUI(node, nodeInfo)
            })
        } else {
            this.setUI(node, nodeInfo)
        }

        // Update Event Registry
        this.updateApp(appId)

        return nodeInfo
    }

    setUI = (node,nodeInfo) => {
        let ui = node.init()

        // Grab Created UI Functions
        if (ui != null) {

            // Grab Responsive Function
            ui.responsive = node.responsive

            // Pass Empty User Dictionary as Final Setup Call (overrides plugin defaults)
            var cachedSetup = ui.setupHTML;
            ui.setupHTML = (app) => {
                cachedSetup(app)
            }

            // Add UI Components to Registries
            if (ui.HTMLtemplate instanceof Function) ui.HTMLtemplate = ui.HTMLtemplate()
            nodeInfo.ui = ui
        }
    }

    updateApp(appId){
        if (this.session.updateApps){
            this.session.updateApps(appId)
        }
    }

    getNode(id,name){
        let appInfo = this.applets[id]
        if (appInfo){
            let node = appInfo.nodes.find(n => {
                if (n.id == name){
                    return true
                }
            })
            return node.instance
        }
    }

    updateParams(node,params) {
        
        for (let param in params) {
            if (param in node.ports) node.ports[param].data = params[param]
            else {
                console.error(`A port for '${param}' does not exist on the ${node.label} node.`)
                console.log(node, param)
            }
        }
    }

    shallowCopy(input){

        let inputCopy = []
        input.forEach(u => {
            inputCopy.push(Object.assign({}, u))

        })
        return inputCopy
    }

    deepCopy(input){
        return JSON.parse(JSON.stringifyFast(input))
    }

    deeperCopy(input){
        let inputCopy = []
        
        let isArray = Array.isArray(input)
        if (!isArray) input = [input]

        input.forEach(u => {
            inputCopy.push(Object.assign({}, u))
            for (let key in u){
                if (u[key] != null && u[key].constructor == Object){
                    u[key] = Object.assign({}, u[key])
                }
            }
        })

        if (!isArray) inputCopy = inputCopy[0]
        return inputCopy
    }

    getLabel(node,port){
        return (port != 'default') ? `${node.label}_${port}` : node.label
    }

    // Input Must Be An Array
    async runSafe(node, port='default',input={}, internal=false){

        let tick = performance.now()

        input.sent = true

        try {
            // Shallow Copy State before Repackaging
            let inputCopy = {}

            let forceRun = false
            let forceUpdate = false
            // let stringify = true
            if (input.forceRun) forceRun = true
            if (input.forceUpdate) forceUpdate = true
            // if (typeof u.data === 'object') stringify = false // Auto-set stringify blocking

            // if (stringify) 
            inputCopy = this.deeperCopy(input)
            // else inputCopy = input

            delete inputCopy.onUpdate
            delete inputCopy.input
            delete inputCopy.output
            delete inputCopy.analysis

            // Add Metadata
            if (!inputCopy.username) inputCopy.username = this.session?.info?.auth?.username
            if (!inputCopy.id) inputCopy.id = this.session?.info?.auth?.id
            if (!inputCopy.meta) inputCopy.meta = {}
            if (!internal) inputCopy.meta.source = this.getLabel(node,port) // Add Source to Externally Triggered Updates
            
            let connected
            if (node.ports[port].output.active > 0) connected = true
            if (node.ports[port].input.active > 0) connected = true
            if (node.ports[port].output.type === null) connected = true
            if (node.ports[port].input.type === null) connected = true

            // Only Continue the Chain with Updated Data (or when forced) AND When Edges Exist

            // console.log('data', 'data' in inputCopy)
            // console.log('forceRun', forceRun)
            // console.log('connected', connected)
            // console.log('forceUpdate', forceUpdate)

            if (('data' in inputCopy || forceRun) && ((connected || forceUpdate))){
                let result

                if (node.ports[port] && node.ports[port].onUpdate instanceof Function) {
                    result = node.ports[port].onUpdate(inputCopy) // New style
                } else if (node.ports['default'] && node.ports['default'].onUpdate instanceof Function) {
                    result = node.ports['default'].onUpdate(inputCopy)
                }

                // Pass Results Appropriately
                if (!result){
                        if (
                            node.ports[port].data === undefined 
                            || ((typeof node.ports[port].data === typeof inputCopy.data) && 'object' !== typeof node.ports[port].data)
                            || (('object' === typeof node.ports[port].data === typeof inputCopy.data && 'constructor' in node.ports[port].data && 'constructor' in inputCopy.data) && (node.ports[port].data.contructor.name === inputCopy.data.contructor.name))
                        ) {
                        node.ports[port].data = inputCopy.data // Set input as output
                }} else if (!!result && typeof result.then === 'function') result.then((r) =>{this.setPort(node,port,r)}) // Handle Promises
                else this.setPort(node,port,result) // Pass output forward to next nodesa
            } 
        } catch (e) { console.log(e)}

        // Calculate Latency
        let tock = performance.now()
        let latency = tock - tick
        if (this.info.latencies[node.uuid] == null) this.info.latencies[node.uuid] = {}
        if (this.info.latencies[node.uuid][port] == null) this.info.latencies[node.uuid][port] = {}
        if (this.info.latencies[node.uuid][port].average == null) this.info.latencies[node.uuid][port].average = latency
        else this.info.latencies[node.uuid][port].average = (this.info.latencies[node.uuid][port].average + latency)/2

        return node.ports[port]
    }

    setState = (state, result) => {
        Object.assign(state, result)
    }

    setPort(node,port,result){

        if (result){
            let allEqual = true
            let forced = false
            let stringify = true

            // if (node.states[port] == null) node.states[port] = [{}]

            // result.forEach((o,i) => {


                // Check if Forced Update
                if (result.forceUpdate) {
                    forced = true
                    this.setState(node.ports[port],result)
                }

                // Otherwise Check If Current State === Previous State
                if (!forced){
                    if (node.ports[port]){ 
                            let case1, case2
                            if (typeof result.data === 'object' || typeof result.data === 'function'){
                                case1 = node.ports[port]
                                case2 = result
                                stringify = false
                            } else {
                                case1 = JSON.stringifyFast(node.ports[port])
                                case2 = JSON.stringifyFast(result)
                            }                            

                            let thisEqual = case1 === case2

                            if (!thisEqual){
                                this.setState(node.ports[port],result)
                                allEqual = false
                            }
                    } else {
                        this.setState(node.ports[port],result)
                        allEqual = false
                    }
            }
            // })

            if ((!allEqual || forced) && node.stateUpdates){
                let updateObj = {}
                let label = this.getLabel(node,port)
                updateObj[label] = {trigger:true}
                if (stringify) updateObj[label].value = JSON.parse(JSON.stringifyFast(node.states[port][0])) // Do not send huge objects
                node.stateUpdates.manager.setState(updateObj);
            }
        }
    }


    triggerAllActivePorts(node){
        for (let port in node.ports){
            this.runSafe(node,port, {forceRun: true, forceUpdate: true})
        }
    }

    init(app){
        
        let id = app.props.id
        let settings = app.info

        let name = settings.name
        let graph = settings.graph

        // Set Default Values for Graph
        let streams = new Set()
        let outputs = {}
        let subscriptions = {
            session: {},
            local: {}
        }
        let controls = {options: new Set(), manager: this.state}
        let nodes = []
        let edges = []

        let analysis = {default: [], dynamic: []}
        if (settings.analysis) analysis.default.push(...settings.analysis)
            

        this.applets[id] = {nodes, edges, name,streams, outputs,subscriptions, controls, analysis}

        // Create Nodes

        let setupCallbacks = []
        if (graph){
            if (Array.isArray(graph.nodes)){
                graph.nodes.forEach((nodeInfo,i) => {
                    let o = this.addNode(app,nodeInfo)
                })
            }

            // Create Edges
            if (Array.isArray(graph.edges)){
                graph.edges.forEach((edge,i) => {
                    try {
                        setupCallbacks.push(this.addEdge(id, edge, false))
                    } catch (e) {console.log('Failed to Create Edge', e)}
                })
            }
        }

        this.applets[id].setupCallbacks = setupCallbacks
        return this.applets[id]
    }

    start(appId, sessionId){

        let applet =  this.applets[appId]

        if (applet){
            if (sessionId != null) applet.sessionId = sessionId
            else applet.sessionId = appId

            applet.setupCallbacks.forEach(f => {if (f instanceof Function) f()})
            // applet.nodes.forEach(this.triggerAllActivePorts)
        }

        return applet
    }

    addPortToRegistry = (node,port) => {
        this.registry.local[node.label].registry[port] = {}
        this.registry.local[node.label].registry[port].state = node.ports[port]
        // this.registry.local[node.label].registry[port].callbacks = []
    }

    instantiateNodePort = (node, port) => {

        // Grab Controls
        let controls = []

        // Set Port State
        // node.states[port] = [{}]

        // Force Default Outputs to Next Node (FIX)
        let defaultVal = node.ports[port].default
        // if (defaultVal !== undefined) {
        //     let user = {data: defaultVal}
        //     if (node.ports[port].meta != null) user.meta = node.ports[port].meta
        //     node.states[port][0] = user
        //     // node.states[port][0].forceRun = true
        //     // node.states[port][0].forceUpdate = true
        // }

        // Derive Control Structure
        let firstUserDefault= node.ports[port]
        if (
            node instanceof this.plugins.controls.Event
            // typeof firstUserDefault.data === 'number' || typeof firstUserDefault.data === 'boolean'
            ){
            let controlDict = {}
            controlDict.format = typeof firstUserDefault.data
            controlDict.label = this.getLabel(node,'default') // Display Label
            controlDict.target = {
                state: node.ports,
                port: 'default'
            } // FIX
            controls.push(controlDict)
        }


        if (node.ports[port].analysis == null) node.ports[port].analysis = []

        if (node.ports[port].onUpdate == null){ // Default Port Function: FIX
            node.ports[port].onUpdate = (user) => {
                node.ports[port].data = user.data
                return user
            }
        }

        let types = ['input', 'output']
        types.forEach(type => {
            if (node.ports[port][type] == null) node.ports[port][type] = {type: undefined, active: 0}
            if (!('active' in node.ports[port][type])) node.ports[port][type].active = 0
        })

        let coerceType = (t) => {
            if (t === 'float') return 'number'
            else if (t === 'int') return'number'
            else return t
        }

        node.ports[port].input.type = coerceType(node.ports[port].input.type)
        node.ports[port].output.type = coerceType(node.ports[port].output.type)

        return controls
    }

    updatePorts = (node) => {
        for (let port in this.registry.local[node.label].registry){
            if (!(port in node.ports)){
                console.log('need to remove a port')
            }
        }
    }

    removePort = (node, port) => {

        // Remove Record of Port
        delete node.ports[port]
        delete this.registry.local[node.label].registry[port]

        // Remove Port on Visual Editor
        let applet = this.applets[node.app?.props?.id]
        if (applet){
            let editor = applet.editor
            if (editor) editor.removePort(node,port)
        }
    }

    addPort = (node, port, info) => {
        if (
            // node.states && 
            info) { // Only if node is fully instantiated      (FIX)       
            let noPort = node.ports[port] == null
            if (noPort || node.ports[port].onUpdate == null){
                
                // Add Port to Node
                node.ports[port] = info
                this.instantiateNodePort(node,port)
                this.addPortToRegistry(node,port)

                // Add Port to Visual Editor
                if (noPort){
                    let applet = this.applets[node.app?.props?.id]
                    if (applet){
                        let editor = applet.editor

                        if (editor) editor.addPort(node,port)
                    }
                }
            }
        }
    }

    getTypeDict = (val) => {
        let typeDict = {type: val}
        if (typeDict.type != null){

            // Catch Objects
            if (typeDict.type instanceof Object) {

                // Catch Arrays
                if (Array.isArray(typeDict.type)) typeDict.type = Array

                // Catch Other Object Types
                else {
                    typeDict.type = Object
                    typeDict.name = val.name ?? typeDict.type.name
                }
            }
            else typeDict.type = typeof typeDict.type
        }
        return typeDict
    }

    addEdge = (appId, newEdge, sendOutput=true) => {

        let applet = this.applets[appId]

        let existingEdge = this.applets[appId].edges.find(edge => {
            if (newEdge.source == edge.source && newEdge.target == edge.target){
                return true
            }
        })
        
        if (existingEdge == null){ // Do not duplicate edges

            let splitSource = newEdge.source.split(':')
            let sourceName = splitSource[0]
            let sourcePort = splitSource[1]
            if (sourcePort == null) sourcePort = 'default'

            let sourceInfo = applet.nodes.find(n => {
                if (n.id == sourceName) return true
            })
            let source = sourceInfo.instance
            let splitTarget = newEdge.target.split(':')
            let targetName = splitTarget[0]
            let targetPort = splitTarget[1]
            if (targetPort == null) targetPort = 'default'
            let targetInfo = applet.nodes.find(n => {
                if (n.id == targetName) return true
            })
            let target = targetInfo.instance
            let label = this.getLabel(source,sourcePort)

            // Initialize Ports with Default Output (FIX)
            let types = ['source', 'target']
            // types.forEach(t => {
            //     if (eval(t).states[eval(`${t}Port`)] == null) {
            //         eval(t).states[eval(`${t}Port`)] = [{}]
            //         let registryEntry = this.registry.local[eval(t).label].registry
            //         if (registryEntry[eval(`${t}Port`)] == null){
            //             registryEntry[eval(`${t}Port`)] = [{}]
            //             registryEntry[eval(`${t}Port`)].state = eval(t).states[eval(`${t}Port`)]
            //         }
            //     }
            // })

            // Pass Data from Source to Target
            let _onTriggered = (o) => {
                if (this.applets[appId]){
                    if (o.trigger){
                        let u = o.value ?? source.ports[sourcePort]
                        if (!u.meta) u.meta = {}
                        if (target instanceof this.plugins.networking.Brainstorm) u.meta.source = label // Push proper source
                        u.meta.session = applet.sessionId

                        let returned = this.runSafe(target, targetPort, u, true)
                        if (this.applets[appId].editor) this.applets[appId].editor.animate(
                            {label:source.label, port: sourcePort},
                            {label:target.label, port: targetPort}, 
                            [
                                {node: source, port: sourcePort, latency: this.info.latencies[source.uuid][sourcePort].average},
                                {node: target, port: targetPort, latency: this.info.latencies[target.uuid][targetPort].average},
                            ])

                        return returned
                    }
                }
            }
            
            this.state.data[label] = this.registry.local[sourceName].registry[sourcePort].state

            // Register Brainstorm State
            let brainstormSource = source instanceof this.plugins.networking.Brainstorm
            let brainstormTarget = target instanceof this.plugins.networking.Brainstorm
            if (brainstormTarget) {
                applet.streams.add(label) // Keep track of streams

                // Initialize Port
                // console.log(source.id, sourcePort, source.ports[sourcePort])
                if (source.ports[sourcePort].meta == null) source.ports[sourcePort].meta = {}
                source.ports[sourcePort].meta.source = label
                source.ports[sourcePort].meta.session = applet.sessionId
                this.runSafe(target, 'default', source.ports[sourcePort], true) // Register port
            } 

            // And Listen for Local Changes
            if (applet.subscriptions.local[label] == null) applet.subscriptions.local[label] = []
            let subId = this.state.subscribeSequential(label, _onTriggered)
            applet.subscriptions.local[label].push({id: subId, target: newEdge.target})

            if (target.ports[targetPort] == null) target.ports[targetPort] = {}
            if (source.ports[sourcePort] == null) source.ports[sourcePort] = {}

            let tP = target.ports[targetPort]
            let sP = source.ports[sourcePort]

            tP.input.active++
            sP.output.active++
            if (tP.input.active && tP.output.active && tP.analysis) applet.analysis.dynamic.push(...tP.analysis)
            if (sP.input.active && sP.output.active && sP.analysis) applet.analysis.dynamic.push(...sP.analysis)

            // Push Edge into Registry
            this.applets[appId].edges.push(newEdge)

            // Update Applet
            this.updateApp(appId)


            let input = source.ports[sourcePort]

            // Check Last State
            let lastStateSent = input.sent
            let hasData = input.data
            let forceSend = input.forceUpdate

            let isElement = input.data instanceof Element || input.data instanceof HTMLDocument

            // Send Last State to New Edge Target
            let sendFunction = () => {
                // Add Default Metadata
                // console.log(input)
                if (input.meta == null) input.meta = {}
                // console.log(input.meta)
                input.meta.source = label
                input.meta.session = applet.sessionId
                this.runSafe(target, targetPort, input, true)
            }

            if (sendOutput && (brainstormTarget || isElement)) sendFunction() // If new connection must pass (1) an element, or (2) anything to the Brainstorm
            else if (
                (!brainstormSource) && 
                (brainstormTarget || ((forceSend || hasData) && !lastStateSent))) return sendFunction // Else if there is data on initialization
        }
    }

    findStreamFunction(prop) {
        return this.session.streamObj.streamTable.find((d => {
            if (d.prop === prop) {
                return d
            }             
        }))
     }

    remove(appId, classId=null, label=null){

        let applet = this.applets[appId]

        if (applet) {

        for (let i = applet.nodes.length-1; i >= 0; i--){
            let n = applet.nodes[i]
            if (classId == null || n.class.id === classId){

            // Increment the Registry for Each Separate Label (of a particular class)
           
            for (let port in n.instance.ports){

                if ((label === null || n.instance.label === label) && this.registry.local[n.instance.label] != null){
                    this.registry.local[n.instance.label].count--

                if (n.instance.ports[port].active != null && (n.instance.ports[port].input.active > 0 || n.instance.ports[port].output.active > 0)){

                    // Catch Edge Removal Case
                    if (this.registry.local[n.instance.label].count == 0) {
                        delete this.registry.local[n.instance.label]
                        this.session.removeStreaming(n.instance.label);
                        this.session.removeStreaming(n.instance.label, null, this.state, true);
                        this.session.removeStreaming(applet.sessionId);
                        this.removeNode(appId,n.instance.label, false)
                    } 
                    else {
                        this.removeMatchingEdges(appId,n.instance.label)
                    }
                } else {
                    // Check Node with No Edges Removal Case
                    if (this.registry.local[n.instance.label].count == 0) delete this.registry.local[n.instance.label]
                    this.removeNode(appId,n.instance.label)
                }
            }
        }
            }
        }

        // // Remove Editor
        if (appId && classId==null && label==null) delete this.applets[appId]
    }
    }

    removeMatchingEdges(id, label){
        let applet = this.applets[id]

        for (let i = applet.edges.length - 1; i >=0; i--) {
            let edge = applet.edges[i] 
            if ((edge.source.split(':')[0] == label) || (edge.target.split(':')[0] == label)){
                this.removeEdge(id,edge)
            }
        }
    }

    removeEdge = (appId, structure) => {

        let applet = this.applets[appId]
        let stateKey = structure.source.replace(':', '_')

        let sessionSubs = applet.subscriptions.session[stateKey]
        let localSubs = applet.subscriptions.local[stateKey]

        if (sessionSubs != null){
            applet.subscriptions.session[stateKey].find(o =>{
                if (o.target === structure.target) {
                    this.session.removeStreaming(stateKey, o.id);
                    return true
                }
            })
        }
        if (localSubs != null){
            localSubs.find(o => {
                if (o.target === structure.target) {
                    this.session.removeStreaming(stateKey, o.id, this.state, true);
                    return true
                }
            })
        }

        applet.edges.find((edge,i) => {
            if (edge === structure){
                this.applets[appId].edges.splice(i,1)
                return true
            }
        })

        // Remove Edge Analysis Flags
        let splitSource = structure.source.split(':')
        let sourceName = splitSource[0]
        let sourcePort = splitSource[1]
        if (sourcePort == null) sourcePort = 'default'
        let sourceInfo = applet.nodes.find(n => {
            if (n.id == sourceName) return true
        })
        let source = sourceInfo.instance
        let splitTarget = structure.target.split(':')
        let targetName = splitTarget[0]
        let targetPort = splitTarget[1]
        if (targetPort == null) targetPort = 'default'

        let targetInfo = applet.nodes.find(n => {
            if (n.id == targetName) return true
        })
        let target = targetInfo.instance
        let tP = target.ports[targetPort]
        let sP = source.ports[sourcePort]
        tP.input.active--
        sP.output.active--

        let toRemove = []
        let toCheck = []
        if (Array.isArray(sP.analysis)) toCheck.push(...sP.analysis)
        if (Array.isArray(tP.analysis)) toCheck.push(...tP.analysis)
        this.applets[appId].analysis.dynamic.forEach((a,i) => {
            if (toCheck.includes(a)) toRemove.push(i)
        })
        toRemove.reverse().forEach(i => {
            this.applets[appId].analysis.dynamic.splice(i,1)
        })
        this.updateApp(appId)
    }

    // Create a Node Editor
    edit(applet, parentNode = document.body, onsuccess = () => {}){
        if (this.applets[applet.props.id]){
            this.applets[applet.props.id].editor = new GraphEditor(this, applet, parentNode, onsuccess)
            return this.applets[applet.props.id].editor
        }
    }

}