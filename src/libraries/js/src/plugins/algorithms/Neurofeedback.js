export class Neurofeedback{
    
    static id = String(Math.floor(Math.random()*1000000))

    constructor(label, session, params={}) {
        this.label = label
        this.session = session

        this.getBandFreqs = (frequencies) => {//Returns an object with the frequencies and indices associated with the bandpass window (for processing the FFT results)
            let oneto20freqs = [[],[]]
            frequencies.forEach((item,idx) => {
                if((item >= 1) && (item <= 20)){
                    oneto20freqs[0].push(item); oneto20freqs[1].push(idx);
                }
            });
            return oneto20freqs
        }

        this.normalize = (val, valmin, valmax, max, min) => { return (val - valmin) / (valmax-valmin) * (max-min) + min; }
        this.fbHistory = []

        this.props = {
            feedbackInfo: {

                    'Select your neurofeedback': {
                        disabled: true,
                        function: () => {return 1}
                    },

                                        
                    // Coherence Neurofeedback
                    'Alpha Coherence': {
                        type: 'coherence',
                        function: (ch) => this.session.atlas.getCoherenceScore(ch,'alpha1')
                    },

                    // Custom Neurofeedback
                    'Focus': {
                        type: 'custom',
                        function: (data) => {
                            let arr = []
                            let frontalData = this.session.atlas.getFrontalData(data)
                            frontalData.forEach(ch => {
                                arr.push(Math.min(1/this.session.atlas.getThetaBetaRatio(ch), 1))
                            })

                            if (this.ports.output.data === 'Channels') return arr
                            else return this.session.atlas.mean(arr)
                        }
                    },

                    'ASoC Induction': { 
                        type: 'custom',
                        function: (data) => {

                            let arr = []
                            data.eeg.forEach(ch => {
                                
                                let fft = ch.ffts[ch.ffts.length - 1]
                                if (fft) {
                                    // console.log(fft)
                                    let oneto20freqs = this.getBandFreqs(data.eegshared.frequencies)
        
                                    if(oneto20freqs[1].length > 0){
                                        arr.push(this.session.atlas.mean(fft.slice( oneto20freqs[1][0], oneto20freqs[1][oneto20freqs[1].length-1]+1)));
                                    }
                                }
                            })

                            let nfbValue = null
                            if (this.ports.output.data === 'Channels') arr
                            else nfbValue = this.session.atlas.mean(arr)

                            this.fbHistory.push(nfbValue)

                            return 1-this.normalize(nfbValue, Math.min(...this.fbHistory), Math.max(...this.fbHistory), 1, 0)

                        }
                    },

                    // Per-Channel EEG Neurofeedback
                    'Alpha Beta Ratio': {
                        type: 'coherence',
                        function: (ch) => this.session.atlas.getAlphaBetaRatio(ch)
                    },
                    'Alpha Theta Ratio': {
                        type: 'coherence',
                        function: (ch) => this.session.atlas.getAlphaThetaRatio(ch)
                    },
                    'Theta Beta Ratio': {
                        type: 'coherence',
                        function: (ch) => this.session.atlas.getThetaBetaRatio(ch)
                    },
                    'Alpha Ratio': {
                        type: 'coherence',
                        function: (ch) => this.session.atlas.getAlphaRatio(ch)
                    },
                    'Gamma Peak': {
                        type: 'coherence',
                        function: (ch) => this.session.atlas.get40HzGamma(ch)
                    },
                    'Low Gamma Score': {
                        type: 'coherence',
                        function: (ch) => this.session.atlas.getLowGammaScore(ch)
                    },

                    // Per-Channel HEG Neurofeedback
                    'HEG Score': {
                        type: 'coherence',
                        function: (ch) => this.session.atlas.getHEGRatioScore(ch)
                    },

            }
        }

        this.props.selector = document.createElement('select') // creates a new selector element with all of the above protocols
        // this.props.selector.style.zIndex = 100
        Object.keys(this.props.feedbackInfo).forEach(key => {
                let o = this.props.feedbackInfo[key]
                if (o.disabled) this.props.selector.insertAdjacentHTML('beforeend', `<option value="${key}" disabled>${key}</option>`)
                else this.props.selector.insertAdjacentHTML('beforeend', `<option value="${key}">${key}</option>`)
            });


        this.props.selector.onchange = (e) => {
            this.ports.metric.data = e.target.value //changes metric to the one that is picked
        }

        // Ports
        this.ports = {

            metric: {
                // edit: false,
                data: 'Alpha Coherence', 
                options: Object.keys(this.props.feedbackInfo),
                input: {type: null},
                output: {type: null},
            },

            output: {
                // edit: false,
                data: 'Mean',
                options: ['Mean', 'Channels'],
                input: {type: null},
                output: {type: null},
            },

            element: {
                data: this.props.selector,
                input: {type: null},
                output: {type: Element},
            },
        } 

        this.ports.default = {
            analysis: ['eegcoherence'],
            data: 1,
            meta: {label: this.ports.metric.data},
            input: {type: Object, name: 'DataAtlas'},
            output: {type: 'number'},
            onUpdate: (user) => {
                    
                let arr = []
                let data = (user.data != null) ? user.data : this.session.atlas.data
    
                // console.log(data)
    
                try {
    
                    console.error(user.data)
                    let type = this.props.feedbackInfo[this.ports.metric.data].type
                    if (type === 'custom'){ // takes whole data array
                        user.data = this.props.feedbackInfo[this.ports.metric.data].function(data) ?? 0 
                    } else {
                        data[type].forEach(o => { //iterates over channels
                            arr.push(this.props.feedbackInfo[this.ports.metric.data].function(o) ?? 0)
                        })
                        
                        if (this.ports.output.data === 'Channels') user.data = arr
                        else user.data = this.session.atlas.mean(arr)
                    }
    
                } catch (e) {
                    console.error(e)
                    arr.push(0)
                    if (this.ports.output.data === 'Channels') user.data = arr
                    else user.data = this.session.atlas.mean(arr)
                }       
    
                // console.log(arr)
                
                // Output to User Data Object
                // console.log(user.data)
    
                user.meta.label = this.ports.metric.data
    
            return user
        }
        }
    }

    init = () => {}

    deinit = () => {}
}