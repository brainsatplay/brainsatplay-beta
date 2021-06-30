
export class Node{
    constructor(nodeInfo, graph) {     
        this.graph = graph
        this.nodeInfo = nodeInfo
        this.parentNode = this.graph.parentNode ?? document.body
        this.element = this.createElement(this.nodeInfo)
        this.edges = []
    }

    registerEdge(edge){
        this.edges.push(edge)   
    }

    updateEdge(edge){
        let o = this.edges.find(o => o === edge)
        // Derive Queries

        let types = Object.keys(o.structure)
        let k1 = types.shift()
        let type = (o.structure[k1].split(':')[0].includes(this.nodeInfo.id)) ? k1 : null
        if (type == null) type = (k1 === 'source') ? 'target' : 'source'
        let className = (type === 'source') ? 'p1' : 'p2'

        // Grab Elements
        let portElement = o[`${type}Node`]
        portElement.classList.add('active') // Label Active Node

        let portDim = portElement.getBoundingClientRect()
        let svgP = o.svgPoint(o.svg, portDim.left + portDim.width/2, portDim.top + portDim.height/2)
        
        // Update Edge Anchor
        o.updateElement(
            o.node[className],
            {
                cx: svgP.x,
                cy: svgP.y
            }
        );

        // Grab Other Side of Edge
        let otherType = (type == 'source') ? 'target': 'source'
        let otherElement = o[`${otherType}Node`]
        let svgO
        if (otherElement){
            let otherDim = otherElement.getBoundingClientRect()
            svgO = o.svgPoint(o.svg, otherDim.left + otherDim.width/2, otherDim.top + otherDim.height/2)
        } else {
            svgO = svgP
        }
        // Update Control Points
        let sP = (type == 'source') ? svgP : svgO
        let tP = (type == 'source') ? svgO : svgP

        o.updateControlPoints(sP, tP)
        o.drawCurve();
    }

    updateAllEdges = () => {
        this.edges.forEach(o => {
            this.updateEdge(o)
        })
    }

    createElement (nodeInfo) {
        let node = nodeInfo.instance
        let nodeDiv = document.createElement(`div`)
        nodeDiv.classList.add("brainsatplay-default-node-div")

        let element = document.createElement(`div`)
        element.classList.add("brainsatplay-display-node")

        let portManager = document.createElement(`div`)
        portManager.classList.add("brainsatplay-port-manager")

        let labelContainer = document.createElement(`div`)
        labelContainer.classList.add(`node-label-container`)


        let labelsAdded = []
        // for (let param in node.params){
        let portTypes = ['target','source']
        portTypes.forEach(s => {

            let portContainer = document.createElement('div')
            portContainer.classList.add(`node-port-container`)
            portContainer.classList.add(`${s}-ports`)

            for (let port in node.ports){

                let inorout = (s == 'target') ? 'input' : 'output'
                let nodeType

                nodeType = node.ports[port][inorout].type
                if (nodeType instanceof Object) nodeType = nodeType.name
                // if (nodeType !== null){
                    let portWrapper = document.createElement('div')
                    portWrapper.classList.add(`node-port-wrapper`)
                    let portElement = document.createElement('div')
                    portElement.classList.add(`node-port`)
                    portElement.classList.add(`port-${port}`)
                    portElement.classList.add(`type-${nodeType}`)

                    portElement.setAttribute('data-node', this.nodeInfo.id)
                    portElement.setAttribute('data-port', port)

                    if (!labelsAdded.includes(port)){
                        labelContainer.innerHTML += `
                            <div class="node-label">
                                <span>${port}</span>
                            </div>
                        `
                        labelsAdded.push(port)
                    }
                    portWrapper.insertAdjacentElement('beforeend',portElement)
                    portContainer.insertAdjacentElement('beforeend',portWrapper)
                // }
            }

            portManager.insertAdjacentElement('beforeend',labelContainer)
            portManager.insertAdjacentElement('beforeend',portContainer)
        })

        element.insertAdjacentHTML('beforeend', `
        <div class="node-text">
            <h3>${node.constructor.name}</h3>
            <p>${node.label}<p>
        </div>
        `)   

        element.insertAdjacentElement('beforeend', portManager)
        nodeDiv.insertAdjacentElement('beforeend',element)
        this.parentNode.insertAdjacentElement('beforeend',nodeDiv)


        let portContainers = nodeDiv.getElementsByClassName(`node-port-container`)

        let minWidth = 100
        let minHeight = 0
        for (let container of portContainers){
            minHeight = Math.max(minHeight, container.offsetHeight)
        }
        minWidth = Math.max(minWidth, labelContainer.offsetWidth)

        if (portManager.offsetWidth < minWidth) portManager.style.width = `${minWidth}px`
        if (portManager.offsetHeight < minHeight) portManager.style.height = `${minHeight}px`


        return nodeDiv
    }
}