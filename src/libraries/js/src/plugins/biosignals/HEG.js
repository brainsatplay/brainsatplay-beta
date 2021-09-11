import { StateManager } from '../../ui/StateManager'
// import { DataAtlas } from '../../DataAtlas'


export class HEG{
    
    static id = String(Math.floor(Math.random()*1000000))

    constructor(label, session, params={}) {
        this.label = label
        this.session = session
        

        this.props = {
            state: new StateManager(),
            deviceSubscriptions: [],
            toUnsubscribe: {
                stateAdded: [],
                stateRemoved: []
            }
        }

        this.ports = {
            atlas: {
                edit: false,
                input: {type:null},
                output: {type: Object, name: 'DataAtlas'},
                onUpdate: () =>{
                    return {data: this.session.atlas.data}
                }
            }
        }

        let keys = ['times','red', 'ir', 'ambient', 'ratio', 'temp']

        // Auto-Generate Ports
        keys.forEach(key => {
            this.ports[key] = {
                edit: false,
                data: [],
                input: {type:null},
                output: {type:Array},
                onUpdate: (user) => {
                    return {data: this.session.atlas.data.heg[0][key]}
                }
            }
        })
    }

    init = () => {
        this.props.toUnsubscribe = this.session.subscribeToDevices('heg', (data) => {
            this.session.graph.triggerAllActivePorts(this)
        })
    }

    deinit = () => {
        for (let key in this.props.toUnsubscribe){
            this.session.state[this.props.toUnsubscribe[key].method](key,this.props.toUnsubscribe[key].idx)
        }
    }
}