import {DOMFragment} from '../../ui/DOMFragment'

export class UI{

    static id = String(Math.floor(Math.random()*1000000))
    
    constructor(label, session) {
        this.label = label
        this.session = session
        this.props = {
            id: String(Math.floor(Math.random() * 1000000)),
            canvas: null,
            container: null,
            context: null,
            drawFunctions: {},
            looping: false,
            fragments: {},
            onload: [],
            onresize: {}
        }

        this.ports = {
            element: {
                input: {type: null},
                output: {type: Element},
                data: document.createElement('div'),
                onUpdate: () => {
                    return {data: this.props.container}
                },
            },
             opacity: {
                input: {type:'number'},
                output: {type: null},
                data: 1,
                min: 0,
                max: 1,
                step: 0.01,
                onUpdate:(user) => {
                    let val = user.data
                    this.props.container.style.opacity = val
                }
             },
             containerStyle: {},
             setupHTML: {},
             parentNode: {},
        }

        // Dynamically Add Ports
        let ports = [
            {key: 'html', input: {type: 'HTML'}, output: {type: null}, data: `<div id='content'></div>`, onUpdate: (user) => {
                
                let newContainer = document.createElement('div')

                newContainer.insertAdjacentHTML('beforeend', user.data)

                let newEls = Array.from(newContainer.querySelectorAll("*"))
                let oldEls = Array.from(this.props.container.querySelectorAll("*"))
                let toRemove = [...oldEls]
                newEls.reverse().forEach((n1, i) => {
                    oldEls.reverse().forEach((n2, j) => {
                        if (n1.id === n2.id) {


                                let moreHTML = n1.innerHTML.trim().length > n2.innerHTML.trim().length
                                let equalHTML = n1.innerHTML.trim() === n2.innerHTML.trim()
                                let active = n2.getAttribute('data-active')

                                let keepUnchanged = (active && n1.innerHTML.trim() === '')

                                let keep = []
                                
                                // Keep If Child are the Same
                                if (!moreHTML){
                                    n1.parentNode.replaceChild(n2, n1) // Move matching elements to new container)
                                    keep.push(n2)
                                }

                                // Keep All Descendents if Element is Active OR Children are the Same
                                if (keepUnchanged || equalHTML){
                                    let descendants = Array.from(n2.querySelectorAll("*"))
                                    keep.push(...descendants)
                                }

                                // Keep ParentNode if Children Different AND Parent Node is not the Container
                                if (moreHTML && n2.parentNode != this.props.container) {
                                    keep.push(n2.parentNode)
                                }
            
                            // Remove Specified Elements from the Removal Array
                            keep.forEach(target => {
                                toRemove.find((el,i) => {
                                    if (target === el) {
                                        toRemove.splice(i,1)
                                        return true
                                    }
                                })
                            })
                        }
                    })
                })

                let removedIds = new Set()
                toRemove.forEach(el => {
                    removedIds.add(el.id)
                    el.remove()
                })

                // Add children to proper container
                for (let child of Array.from(newContainer.children).reverse()){
                    this.props.container.appendChild(child)
                }

                // Create ID Ports
                var descendants = this.props.container.querySelectorAll("*");
                for (let node of descendants){

                    // Find Descendents with ID
                    let noDescendentWithID = true
                    Array.from(node.querySelectorAll("*")).forEach(el => {
                        if (el.id !=- null) noDescendentWithID = false
                    })
                    
                    // node.innerHTML.trim() === ''
                    if (node.id && noDescendentWithID){ // Create ports for blank elements with IDs
                        removedIds.delete(node.id) // Actually still there

                        this.session.graph.addPort(this,node.id, {
                            edit: false,
                            input: {type: undefined},
                            output: {type: null},
                            onUpdate: (user) => {
                                let data = user.data
                                if (data instanceof Function) data = data()

                                node.innerHTML = ''
                                if (
                                    typeof data === "object" ? data instanceof HTMLElement : //DOM2
                                    data && typeof data === "object" && data !== null && data.nodeType === 1 && typeof data.nodeName==="string"
                                ) {
                                    node.insertAdjacentElement('beforeend', data)
                                    node.setAttribute('data-active', true)
                                    setTimeout(() => {
                                        if (data.onload instanceof Function) data.onload()
                                        if (data.onresize instanceof Function) {
                                            this.props.onresize[node.id] = data.onresize
                                            this.responsive()
                                        }
                                    },250) // Wait a bit for onload functions to ensure element has been added
                                }
                                else node.insertAdjacentHTML('beforeend', String(data))
                            }
                        })

                        // Fill Width/Height by Default
                        if (!this.ports.style.data.includes(`#${node.id}`)) {
                            this.session.graph.runSafe(this, 'style', {data: this.ports.style.data + `\n\n#${node.id} {\n\twidth: 100%;\n\theight: 100%;\n}`})
                        }

                    }
                }

                // // Remove Unused IDs as Ports
                Array.from(removedIds).forEach(id => {
                    this.session.graph.removePort(this, id) // Remove Port of Non-Empty Ids                                     
                })
            }}, 
            // {key: 'parentNode', input: {type: Element}, output: {type: null}, default: document.body}, 
            {key: 'style', input: {type: 'CSS'}, output: {type: null}, data: `.brainsatplay-ui-container {\n\twidth: 100%;\n\theight: 100%;\n}`, onUpdate: (user) => {
                
                if (this.app.AppletHTML){ // Wait for HTML to Exist
                    if (this.props.style == null){
                        this.props.style = document.createElement('style')
                        this.props.style.id = `${this.props.id}style`
                        this.props.style.type = 'text/css';
                        this.app.AppletHTML.appendStylesheet(() => {return this.props.style});
                    }

                    // Scope the CSS (add ID scope)
                    if (user.data){
                        let styleArray = user.data.split(/[{}]/).filter(String).map(function(str){
                            return str.trim(); 
                        });

                        let newStyle = ``
                        for (let i = 0; i < styleArray.length - 1; i+=2){
                            if (styleArray[i].includes('.brainsatplay-ui-container')) newStyle += `[id='${this.props.id}']` // styleArray[i+1]
                            else newStyle += `[id='${this.props.id}'] ${styleArray[i]} `
                            newStyle +=`{\n\t${styleArray[i+1]}\n}\n\n`
                        }

                        this.props.style.innerHTML = newStyle
                    }
                }
            }}, 
            {key: 'deinit', input: {type: Function}, output: {type: null}, data: ()=>{}}, 
            {key: 'responsive',input: {type: Function}, output: {type: null}, data: ()=>{}}
        ]

        ports.forEach(o => {

            this.ports[o.key] = {
                input: o.input,
                output: o.output,
                data: o.data,
                onUpdate: (user) => {
                    if (o.onUpdate) o.onUpdate(user)
                    return user
                }
            }
            
            if (o.edit === false) this.ports[o.key].edit = false
        })

    }

    init = () => {

        this.props.container = document.createElement('div')
        this.props.container.id = this.props.id
        this.props.container.classList.add('brainsatplay-ui-container')
        this.props.container.style = this.ports.containerStyle.data
        this.session.graph.runSafe(this,'html', {data: this.ports.html.data})

        // Create Stylesheet
        let HTMLtemplate = this.props.container

        let setupHTML = () => {
                if (this.ports.setupHTML.data instanceof Function) this.ports.setupHTML.data()

                // Wait to Reference AppletHTML
                setTimeout(() => {
                   if (this.ports.style.data) this.session.graph.runSafe(this,'style', {data: this.ports.style.data})
                }, 250)
        }

        return { HTMLtemplate, setupHTML}
    }

    deinit = () => { 
        if (this.ports.deinit.data instanceof Function) this.ports.deinit.data()
        this.props.style.remove()
    }

    responsive = () => {
        if (this.ports.responsive.data instanceof Function) this.ports.responsive.data()
       for (let key in this.props.onresize){
           this.props.onresize[key]()
       }
    }
}