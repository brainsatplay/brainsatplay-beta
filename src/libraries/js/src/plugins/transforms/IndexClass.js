export class Index{

    static id = String(Math.floor(Math.random()*1000000))
    
    constructor(label, session, params={}) {
        this.label = label
        this.session = session
        this.params = params

        this.ports = {
            default: {
                edit: false,
                input: {type: Array},
                output: {type: undefined},
                onUpdate: (userData) => {
                    let u = userData[0]
                    let idx;
                    if (u.data){
                        if (this.params.method == 'first') idx = 0
                        if (this.params.method == 'last') idx = u.data.length - 1
                        return [{data: u.data[idx]}]
                    }
                }
            },
            method: {
                default: 'first',
                input: {type: 'string'},
                output: {type: null},
                options: ['first','last'],
                onUpdate: (userData) => {
                    let u = userData[0]
                    if (this.ports.method.options.includes(u.data)) this.params.method = u.data
                }
            }
        }
    }

    init = () => {}

    deinit = () => {}
}