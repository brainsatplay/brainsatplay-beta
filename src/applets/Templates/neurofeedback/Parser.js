class Parser{

    static id = String(Math.floor(Math.random()*1000000))

    constructor(label, session) {

        // Generic Plugin Attributes
        this.label = label
        this.session = session

        // UI Identifier
        this.props = {
            id: String(Math.floor(Math.random()*1000000)),
            state: null,
            userReadouts: {}
        }

        this.props.container = document.createElement('div')
        this.props.container.id = this.props.id
        this.props.container.style = `
            width: 80%;
        `

        this.props.label = document.createElement('h1')
        this.props.readouts = document.createElement('div')

        this.props.dummyReadout = document.createElement('p')
        this.props.dummyReadout.innerHTML = 'Waiting for Data'
        this.props.readouts.insertAdjacentElement('beforeend', this.props.dummyReadout)

        this.props.label.innerHTML = 'LABEL'

        // this.props.defaultReadout = document.createElement('p')
        // this.props.defaultReadout.classList.add('readout')
        // this.props.defaultReadout.innerHTML = 'Username: Data'
        // this.props.readouts.insertAdjacentElement('beforeend', this.props.defaultReadout)

        this.props.container.insertAdjacentElement('beforeend', this.props.label)
        this.props.container.insertAdjacentElement('beforeend', this.props.readouts)

        // Port Definition
        this.ports = {
            default: {
                input: {type: 'number'},
                output: {type: null},
                onUpdate: (user) => {
                    this.props.label.innerHTML = user.meta.label ?? 'Neurofeedback Template'
                    if (this.props.userReadouts[user.id]) {
                        this.props.userReadouts[user.id].innerHTML = `${user.username}: ${user.data}`
                        this.props.dummyReadout.style.display = 'none'
                    } else this.props.dummyReadout.style.display = 'block'
            },
        }, 
        element: {
            data: this.props.container,
            input: {type: null},
            output: {type: Element},
        }
        }
    }

    init = () =>  {    }

    deinit = () => {}

    _userAdded = (user) => {
        this.props.userReadouts[user.id] = document.createElement('p')
        this.props.userReadouts[user.id].id = `${this.props.id}-${user.id}`
        this.props.userReadouts[user.id].classList.add('readout')
        this.props.userReadouts[user.id].innerHTML = `${user.username}: ${user.data ?? ''}`
        this.props.readouts.insertAdjacentElement('beforeend', this.props.userReadouts[user.id])
        this._updateUI()
    }

    _userRemoved = (user) => {
        if (this.props.userReadouts[user.id]) this.props.userReadouts[user.id].remove()
        delete this.props.userReadouts[user.id]
        this._updateUI()
    }

    _updateUI = () => {
        // let coherenceReadouts = this.props.readouts.querySelectorAll(`.readout`)
        // if (coherenceReadouts.length > 1) this.props.defaultReadout.style.display = 'none'
        // else this.props.defaultReadout.style.display = 'block'
    }
}

export {Parser}