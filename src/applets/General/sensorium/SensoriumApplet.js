// Available Uniforms for shader effects:
// iResolution: {value: new THREE.Vector2(400,400)}, // Resolution of the renderer 
// iTime: {value: 0},                      // Time (in seconds)


import {Session} from '../../../libraries/js/src/Session'
import {DOMFragment} from '../../../libraries/js/src/ui/DOMFragment'
import { SoundJS } from '../../../platform/js/frontend/UX/Sound';
import * as settingsFile from './settings'

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GUI } from 'three/examples/jsm/libs/dat.gui.module'
import vertexShader from './shaders/vertex.glsl'
import galaxyFragmentShader from "./shaders/fractalGalaxy/fragment.glsl"
import negaGalaxyFragmentShader from "./shaders/nega_fractalGalaxy/fragment.glsl"
import wavesFragmentShader from './shaders/waves/fragment.glsl'
import noiseCircleFragmentShader from './shaders/noiseCircle/fragment.glsl'
import creationFragmentShader from './shaders/creation/fragment.glsl'
import blobFragmentShader from './shaders/voronoiblobs/fragment.glsl'
import fractalpyramidFragmentShader from './shaders/fractalpyramid/fragment.glsl'
import cineshaderlavaFragmentShader from './shaders/cineshaderlava/fragment.glsl'
import octagramsFragmentShader from './shaders/octagrams/fragment.glsl'

import {addChannelOptions, addCoherenceOptions } from '../../../platform/js/frontend/menus/selectTemplates'

//Example Applet for integrating with the UI Manager
export class SensoriumApplet {

    constructor(
        parent=document.body,
        session=new Session(),
        settings=[]
    ) {
    
        //-------Keep these------- 
        this.session = session; //Reference to the Session to access data and subscribe
        this.parentNode = parent;
        this.info = settingsFile.settings;
        this.settings = settings;
        this.AppletHTML = null;
        //------------------------

        //-------Required Multiplayer Properties------- 
        this.subtitle = `Dynamic audiovisual feedback. Let's get weird` // Specify a subtitle for the title screen
        this.streams = ['modifiers'] // Register your app data streams
        //----------------------------------------------

        //-------Other Multiplayer Properties------- 
        this.stateIds = []
        //----------------------------------------------

        this.props = { //Changes to this can be used to auto-update the HTML and track important UI values 
            id: String(Math.floor(Math.random()*1000000)), //Keep random ID
            //Add whatever else
        };

        // Audio
        this.effectStruct = { source:undefined, input:undefined, controls:undefined, feedback:undefined, feedbackOption:undefined, muted:false, lastGain:1, uiIdx:false, sourceIdx:false, playing:false, id:undefined };
        this.visuals = [];
        this.effects = [];//array of effectStructs

        this.looping = false;
        this.hidden = false;

        // UI
        this.three = {}
        this.currentShader = null;

        this.three.planes = [];
        this.guiControllers = []

        //Available uniforms for shaders. See comments for usage
        this.modifiers = {
            iAudio:           new Array(256).fill(0),     //Audio analyser FFT, array of 256, values max at 255
            iHRV:             1,                          //Heart Rate Variability (values typically 5-30)
            iHEG:             0,                          //HEG change from baseline, starts at zero and can go positive or negative
            iHR:              1,                          //Heart Rate in BPM
            iHB:              0,                          //Is 1 when a heart beat occurs, falls off toward zero on a 1/t curve (s)
            iBRV:             0,                          //Breathing rate variability, usually low, ideal is 0.
            iFFT:             new Array(256).fill(0),     //Raw EEG FFT, array of 256. Values *should* typically be between 0 and 100 (for microvolts) but this can vary a lot so normalize or clamp values as you use them
            iDelta:           1,                          //Delta bandpower average. The following bandpowers have generally decreasing amplitudes with frequency.
            iTheta:           1,                          //Theta bandpower average.
            iAlpha1:          1,                          //Alpha1 " "
            iAlpha2:          1,                          //Alpha2 " "
            iBeta:            1,                          //Beta " "
            iGamma:           1,                          //Low Gamma (30-45Hz) " "
            iThetaBeta:       1,                          //Theta/Beta ratio
            iAlpha1Alpha2:    1,                          //Alpha1/Alpha2 ratio
            iAlphaBeta:       1,                          //Alpha/Beta ratio
            i40Hz:            1,                          //40Hz bandpower
            iAlpha1Coherence: 0                           //Alpha 1 coherence, typically between 0 and 1 and up, 0.9 and up is a strong correlation
        };

        this.uniformSettings = {
            iAudio:           {default: new Array(256).fill(0), min:0,max:255},              //Audio analyser FFT, array of 256, values max at 255
            iHRV:             {default:1, min:0, max:40,step:0.5},                           //Heart Rate Variability (values typically 5-30)
            iHEG:             {default:0, min:-3, max:3,step:0.1},                           //HEG change from baseline, starts at zero and can go positive or negative
            iHR:              {default:1, min:1, max:240,step:1},                            //Heart Rate in BPM
            iHB:              {default:0, min:0, max:1},                                     //Is 1 when a heart beat occurs, falls off toward zero on a 1/t curve (s)
            iBRV:             {default:1, min:0, max:10,step:0.5},                           //Breathing rate variability, usually low, ideal is 0.
            iFFT:             {default:new Array(256).fill(0),min:0,max:1000},               //Raw EEG FFT, array of 256. Values *should* typically be between 0 and 100 (for microvolts) but this can vary a lot so normalize or clamp values as you use them
            iDelta:           {default:1, min:0, max:100,step:0.5},                          //Delta bandpower average. The following bandpowers have generally decreasing amplitudes with frequency.
            iTheta:           {default:1, min:0, max:100,step:0.5},                          //Theta bandpower average.
            iAlpha1:          {default:1, min:0, max:100,step:0.5},                          //Alpha1 " "
            iAlpha2:          {default:1, min:0, max:100,step:0.5},                          //Alpha2 " "
            iBeta:            {default:1, min:0, max:100,step:0.5},                          //Beta " "
            iGamma:           {default:1, min:0, max:100,step:0.5},                          //Low Gamma (30-45Hz) " "
            iThetaBeta:       {default:1, min:0, max:5,step:0.1},                            //Theta/Beta ratio
            iAlpha1Alpha2:    {default:1, min:0, max:5,step:0.1},                            //Alpha1/Alpha2 ratio
            iAlphaBeta:       {default:1, min:0, max:5,step:0.1},                            //Alpha/Beta ratio
            iAlphaTheta:      {default:1, min:0, max:5,step:0.1},
            i40Hz:            {default:1, min:0, max:10,step:0.1},                           //40Hz bandpower
            iAlpha1Coherence: {default:0, min:0, max:1.1,step:0.1}                           //Alpha 1 coherence, typically between 0 and 1 and up, 0.9 and up is a strong correlation
        };

        this.defaultUniforms = {iResolution: {value: 'auto'}, iTime: {value: 0}}

        this.shaders = {
            galaxy: {
                name: 'Galaxy',
                vertexShader: vertexShader,
                fragmentShader: galaxyFragmentShader,
                uniforms: ['iAudio','iHRV','iHEG','iHB','iHR','iAlpha1Coherence'],
                credit: 'JoshP (Shadertoy)'
            },
            negagalaxy: {
                name: 'Nega Galaxy',
                vertexShader: vertexShader,
                fragmentShader: negaGalaxyFragmentShader,
                uniforms: ['iAudio','iHRV','iHEG','iHB','iHR','iAlpha1Coherence'],
                credit: 'JoshP (Shadertoy) * JoshB'
            },
            waves: {
                name: 'Rainbow Waves',
                vertexShader: vertexShader,
                fragmentShader: wavesFragmentShader,
                uniforms: ['iAlpha1Coherence','iHEG','iHRV'],
                credit: 'Pixi.js'
            },
            noisecircle: {
                name: 'Noise Circle',
                vertexShader: vertexShader,
                fragmentShader: noiseCircleFragmentShader,
                uniforms: ['iAlpha1Coherence','iHEG','iHRV'],
                credit: 'Garrett Flynn'
            },
            creation: {
                name: 'Creation',
                vertexShader: vertexShader,
                fragmentShader: creationFragmentShader,
                uniforms: ['iAlpha1Coherence','iHEG','iHRV'],
                credit: 'Danilo Guanabara (Shadertoy)'
            },
            voronoiblobs: {
                name: 'Voronoi Blobs',
                vertexShader: vertexShader,
                fragmentShader: blobFragmentShader,
                uniforms: [],
                credit: 'Elise (Shadertoy)'
            },
        }

        this.brainMetrics = [
            {name:'delta',label: 'Delta', color: [0,0.5,1]}, // Blue-Cyan
            {name:'theta',label: 'Theta',color: [1,0,1]}, // Purple
            {name:'alpha1',label: 'Low Alpha',color:[0,1,0]}, // Green
            {name:'alpha2',label: 'High Alpha',color: [0,1,0]}, // Green
            {name:'beta',label: 'Beta',color: [1,1,0]}, // Yellow
            {name:'lowgamma',label: 'Gamma',color: [1,0,0]} // Red
        ]

        this.brainData = []   
        this.lastColorSwitch=Date.now() 

        this.history = 5; 
    }

    //---------------------------------
    //---Required template functions---
    //---------------------------------

    //Initalize the app with the DOMFragment component for HTML rendering/logic to be used by the UI manager. Customize the app however otherwise.
    init() {

        //HTML render function, can also just be a plain template string, add the random ID to named divs so they don't cause conflicts with other UI elements
        let HTMLtemplate = (props=this.props) => { 
            return `
            <div id='${props.id}' style='height:100%; width:100%; position: relative;'>
            <div style="position:absolute; top: 75px; right: 25px; z-index: 1;">
                <select id='${props.id}shaderSelector'></select>
            </div>
            <div class='guiContainer' style="position:absolute; top: 0px; right: 25px; z-index: 1;">
            </div>
                <div id='`+props.id+`menu' style='position:absolute; z-index:2; position: absolute; top: 0; left: 0;'> 
                    <button id='`+props.id+`showhide' style='z-index:2; opacity:0.2;'>Hide UI</button> 
                    <button id='${props.id}addeffect'>Add Effects</button>
                    <button id='${props.id}Micin'>Mic In</button>
                    <span id='${props.id}effectmenu'></span>
                    </div>
                </div>    
            </div>`;
        }


        //HTML UI logic setup. e.g. buttons, animations, xhr, etc.
        let setupHTML = (props=this.props) => {

            this.session.createIntro(this)

            /**
             * GUI
             */
            this.appletContainer = document.getElementById(this.props.id)
            this.gui = new GUI({ autoPlace: false });
            this.appletContainer.querySelector('.guiContainer').appendChild(this.gui.domElement);

            document.getElementById(props.id+'addeffect').onclick = () => {
                this.addSoundInput();
                console.log('clicked to add sound input')
            };

            let selector = document.getElementById(`${this.props.id}shaderSelector`)
            Object.keys(this.shaders).forEach((k) => {
                selector.innerHTML += `<option value='${k}'>${this.shaders[k].name}</option>`
            });
            
            this.currentShader = this.shaders[selector.value];
            this.swapShader();
            
            selector.onchange = (e) => {
                if (e.target.value != 'Gallery'){
                    this.currentShader = this.shaders[selector.value]
                    this.swapShader();
                    this.setEffectOptions();
                } else {
                    
                }
            }

            document.getElementById(props.id+'Micin').onclick = () => {
                let idx = undefined;
                let found = this.effects.find((o,i) => {
                    if(o.id === 'Micin') {
                        idx=i;
                        return true;
                    }
                });
                if(!found){
                    //start mic
                    if(!window.audio) {
                        window.audio = new SoundJS();
                        if (window.audio.ctx===null) {return;};
                    }
                    this.effects.push(JSON.parse(JSON.stringify(this.effectStruct)));
                    let fx = this.effects[this.effects.length-1];

                    fx.sourceIdx = window.audio.record(undefined,undefined,null,null,false,()=>{
                        console.log(fx.sourceIdx)
                        if(fx.sourceIdx !== undefined) {
                            fx.source = window.audio.sourceList[window.audio.sourceList.length-1];
                            //window.audio.sourceGains[fx.sourceIdx].gain.value = 0;
                            fx.playing = true;
                            fx.feedbackOption = 'iAudio';
                            fx.id = 'Micin';
                            document.getElementById(props.id+'Micin').innerHTML = "Stop Mic";
                            //fx.source.mediaStream.getTracks()[0].enabled = false;
                        }
                    });
                    
                } else {
                    //stop mic

                    found.source.mediaStream.getTracks()[0].stop();
                    this.effects.splice(idx,1);
                    document.getElementById(props.id+'Micin').innerHTML = "Mic In";
                }
                
            }

            let showhide = document.getElementById(props.id+'showhide');

            showhide.onclick = () => {
                if(this.hidden == false) {
                    this.hidden = true;
                    document.getElementById(props.id+"showhide").innerHTML = "Show UI";
                    document.getElementById(props.id+'addeffect').style.display = "none";
                    document.getElementById(props.id+'effectmenu').style.display = "none";
                    document.getElementById(props.id+'shaderSelector').style.display = "none";
                    this.appletContainer.querySelector('.guiContainer').style.display = "none";
                }
                else{
                    this.hidden = false;
                    document.getElementById(props.id+"showhide").innerHTML = "Hide UI";
                    document.getElementById(props.id+'addeffect').style.display = "";
                    document.getElementById(props.id+'effectmenu').style.display = "";
                    document.getElementById(props.id+'shaderSelector').style.display = "";
                    this.appletContainer.querySelector('.guiContainer').style.display = "";
                }
            }

            showhide.onmouseover = () => {
                showhide.style.opacity = 1.0;
            }
            showhide.onmouseleave = () => {
                showhide.style.opacity = 0.2;
            }
        }

        this.AppletHTML = new DOMFragment( // Fast HTML rendering container object
            HTMLtemplate,       //Define the html template string or function with properties
            this.parentNode,    //Define where to append to (use the parentNode)
            this.props,         //Reference to the HTML render properties (optional)
            setupHTML,          //The setup functions for buttons and other onclick/onchange/etc functions which won't work inline in the template string
            undefined,          //Can have an onchange function fire when properties change
            "NEVER"             //Changes to props or the template string will automatically rerender the html template if "NEVER" is changed to "FRAMERATE" or another value, otherwise the UI manager handles resizing and reinits when new apps are added/destroyed
        );  

        if(this.settings.length > 0) { this.configure(this.settings); } //You can give the app initialization settings if you want via an array.


        //Add whatever else you need to initialize
        this.looping = true;
        
        this.ct = 0;



    // Multiplayer
    this.stateIds.push(this.session.streamAppData('modifiers', this.modifiers, (newData) => {
        //console.log('new data!')
    }));


    /**
     * Scene
     */
    this.three.scene = new THREE.Scene()

    /**
     * Camera
     */

    this.baseCameraPos = new THREE.Vector3(0,0,3)
    this.camera = new THREE.PerspectiveCamera(75, this.appletContainer.offsetWidth/this.appletContainer.offsetHeight, 0.01, 1000)
    this.camera.position.z = this.baseCameraPos.z//*1.5

    /**
     * Texture Params
     */

    let containerAspect = this.appletContainer.offsetWidth/this.appletContainer.offsetHeight //this.appletContainer.offsetWidth/this.appletContainer.offsetHeight
    this.fov_y = this.camera.position.z * this.camera.getFilmHeight() / this.camera.getFocalLength();

    // Square
    //  this.three.meshWidth = this.three.meshHeight = Math.min(((fov_y)* this.camera.aspect) / containerAspect, (fov_y)* this.camera.aspect);

    // Fit Screen
    this.three.meshWidth = this.fov_y * this.camera.aspect
    this.three.meshHeight = this.three.meshWidth/containerAspect

    // Renderer
    this.three.renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
    this.three.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
    this.three.renderer.setSize( this.appletContainer.offsetWidth, this.appletContainer.offsetHeight );
    this.appletContainer.appendChild( this.three.renderer.domElement );
    this.three.renderer.domElement.style.width = '100%'
    this.three.renderer.domElement.style.height = '100%'
    this.three.renderer.domElement.id = `${this.props.id}canvas`
    this.three.renderer.domElement.style.opacity = '0'
    this.three.renderer.domElement.style.transition = 'opacity 1s'

    // Controls
    this.controls = new OrbitControls(this.camera, this.three.renderer.domElement)
    this.controls.enablePan = false
    this.controls.enableDamping = true
    this.controls.enabled = false;
    this.controls.minPolarAngle = 2*Math.PI/6; // radians
    this.controls.maxPolarAngle = 4*Math.PI/6; // radians
    this.controls.minDistance = this.baseCameraPos.z; // radians
    this.controls.maxDistance = this.baseCameraPos.z*10; // radians

    // Plane
    const planeGeometry = new THREE.PlaneGeometry(this.three.meshWidth, this.three.meshHeight, 1, 1);
    let tStart = Date.now();

    let shaderKeys = Object.keys(this.shaders);
    let numShaders = shaderKeys.length;

    this.defaultUniforms.iResolution = {value: new THREE.Vector2(this.three.meshWidth, this.three.meshHeight)}, //Required for ShaderToy shaders
    
    shaderKeys.forEach((k,i) => {

        if (i === 0){
            let material = new THREE.ShaderMaterial({
                transparent: true,
                side: THREE.DoubleSide,
                vertexShader: this.shaders[k].vertexShader,
                fragmentShader: this.shaders[k].fragmentShader,
                uniforms: {...this.defaultUniforms}// Default Uniforms 
            });

            let radius = 0;//10
            let plane = new THREE.Mesh(planeGeometry, material)
            plane.name = k
            let angle = (2 * Math.PI * i/numShaders) - Math.PI/2
            plane.position.set(radius*(Math.cos(angle)),0,radius*(Math.sin(angle)))
            plane.rotation.set(0,-angle - Math.PI/2,0)
            this.three.planes.push(plane)
            this.three.scene.add(plane)
        }
    });

        // Animate
        this.startTime = Date.now()
        this.render = () => {
            if (this.three.renderer.domElement != null){

                let userData = this.session.getBrainstormData(this.info.name, this.streams)
                //console.log(userData)
                if (userData.length > 0){
                    let averageModifiers = {};
                    userData.forEach((data) => {
                       if (data.modifiers){
                            // Only average watched values
                            this.currentShader.uniforms.forEach(name => {
                                if (averageModifiers[name] == null) averageModifiers[name] = []
                                if (data.modifiers[name].constructor === Uint8Array) data.modifiers[name] = Array.from(data.modifiers[name])
                                averageModifiers[name].push(data.modifiers[name])
                            });
                        }
                    })

                    for (let mod in averageModifiers){
                        if (!Array.isArray(averageModifiers[mod][0])) averageModifiers[mod] = this.session.atlas.mean(averageModifiers[mod])
                        else { // Average across each sample (e.g. FFTs)
                            let newArr = Array(averageModifiers[mod][0].length)
                            for (let i = 0; i < newArr.length; i++){
                                let sampleAve = []
                                averageModifiers[mod].forEach(a => {
                                    sampleAve.push(a[i])
                                })
                                newArr[i] = this.session.atlas.mean(sampleAve)
                            }
                            averageModifiers[mod] = newArr
                        }
                    }
                    //console.log(averageModifiers)
                    this.three.planes.forEach(p => {
                        this.updateMaterialUniforms(p.material,averageModifiers);
                    });

                    this.controls.update()
                    this.three.renderer.render( this.three.scene, this.camera );
                
                }
            }
        };

        this.three.renderer.setAnimationLoop( this.render );
        this.animate();

        setTimeout(() => {
            this.three.renderer.domElement.style.opacity = '1'
            // this.controls.enabled = true;
        }, 100)
        
        document.getElementById(this.props.id+'addeffect').click();
    }

    //Delete all event listeners and loops here and delete the HTML block
    deinit() {
        this.looping = false;
        this.effects.forEach((struct,idx)=>{
            if(struct.id === 'Micin') {
                struct.source.mediaStream.getTracks()[0].stop();
            }
            else if(struct.sourceIdx) window.audio.stopSound(struct.sourceIdx);
            
        });
        this.stateIds.forEach(id => {
            this.session.state.unsubscribeAll(id);
        })
        this.three.renderer.setAnimationLoop( null );
        this.clearThree()
        this.AppletHTML.deleteNode();
        //Be sure to unsubscribe from state if using it and remove any extra event listeners
    }

    //Responsive UI update, for resizing and responding to new connections detected by the UI manager
    responsive() {
        if(this.three.renderer) {
            this.camera.aspect = this.appletContainer.offsetWidth/this.appletContainer.offsetHeight
            this.camera.updateProjectionMatrix()
            // Resize Plane Geometry
            let containerAspect = this.appletContainer.offsetWidth/this.appletContainer.offsetHeight
            // let fov_y = this.camera.position.z * this.camera.getFilmHeight() / this.camera.getFocalLength();
            // this.three.meshWidth = this.three.meshHeight = Math.min(((fov_y)* this.camera.aspect) / containerAspect, (fov_y)* this.camera.aspect);
            this.three.meshWidth = this.fov_y * this.camera.aspect
            this.three.meshHeight = this.three.meshWidth/containerAspect

            let newGeometry = new THREE.PlaneGeometry(this.three.meshWidth, this.three.meshHeight, 1, 1)
            this.three.planes.forEach(p => {
                p.geometry.dispose()
                p.geometry = newGeometry
                p.material.uniforms.iResolution.value = new THREE.Vector2(this.three.meshWidth, this.three.meshHeight)
            })
            
            this.three.renderer.setSize(this.appletContainer.offsetWidth, this.appletContainer.offsetHeight);
        }
        
    }

    configure(settings=[]) { //For configuring from the address bar or saved settings. Expects an array of arguments [a,b,c] to do whatever with
        settings.forEach((cmd,i) => {
            //if(cmd === 'x'){//doSomething;}
        });
    }

    //--------------------------------------------
    //--Add anything else for internal use below--
    //--------------------------------------------

    addSoundInput = () => {
        let fileinput = (idx=0, props=this.props) => {
            return `
                Feedback ${idx}: 
                <span id='${props.id}selectors${idx}'></span>
                <span id='${props.id}fileWrapper${idx}' style='font-size:10px;'> 
                    <span id='${props.id}fileinfo${idx}'></span> 
                    Sounds:<select id='${props.id}select${idx}'><option value=''>None</option></select> 
                    <button id='${props.id}uploadedFile${idx}'>Add File</button> ${idx}
                    <span id='${props.id}status${idx}'></span>
                </span>
            `;
        }

        let controls = (idx=0, props=this.props) => {
            return `
                <span id='${props.id}controlWrapper${idx}'>
                    <button id='${props.id}play${idx}'>${idx}: Play</button>
                    <button id='${props.id}mute${idx}' style='display:none;'>${idx}: Mute</button>
                    <button id='${props.id}stop${idx}'>${idx}: Remove</button>
                </span>
            `;
        }
        
        let fdback = (idx=0, props=this.props) => {
            return `
            <select id='${props.id}select${idx}'>
                <option value='none'>None</option>
                <option value='iAudio'>Audio FFT</option>
                <option value='iHB'>Heart Beat</option>
                <option value='iHR'>Heart Rate</option>
                <option value='iHEG'>HEG Ratio</option>
                <option value='iHRV'>Heart Rate Variability</option>
                <option value='iBRV'>Breathing Rate Variability</option>
                <option value='iFFT'>EEG Bandpower FFT</option>
                <option value='iDelta'>Delta Bandpower</option>
                <option value='iTheta'>Theta Bandpower</option>
                <option value='iAlpha1'>Alpha1 Bandpower</option>
                <option value='iAlpha2'>Alpha2 Bandpower</option>
                <option value='iBeta'>Beta Bandpower</option>
                <option value='iGamma'>Low Gamma Bandpower</option>
                <option value='i40Hz'>40Hz Bandpower</option>
                <option value='iThetaBeta'>Theta/Beta Ratio</option>
                <option value='iAlpha1Alpha2'>Alpha 2/1 Ratio</option>
                <option value='iAlphaBeta'>Alpha/Beta Ratio</option>
                <option value='iAlphaTheta'>Alpha/Theta Ratio</option>
                <option value='iAlpha1Coherence'>Frontal Alpha Coherence</option>
            </select>
            <select id='${props.id}channel${idx}' style='display:none;'></select>
            `;
        }

        let idx = this.ct; this.ct++;

        let newEffect = JSON.parse(JSON.stringify(this.effectStruct));
        this.effects.push(newEffect);
        newEffect.uiIdx = idx;
        
        document.getElementById(this.props.id+'effectmenu').insertAdjacentHTML('beforeend',`<div id='${this.props.id}effectWrapper${idx}'>`+fileinput(idx)+`</div>`);
        newEffect.input = document.getElementById(this.props.id+'fileWrapper'+idx);

        document.getElementById(this.props.id+'selectors'+newEffect.uiIdx).insertAdjacentHTML('beforeend',fdback(idx));
        newEffect.feedback = document.getElementById(this.props.id+'select'+newEffect.uiIdx)
        console.log(newEffect.feedback.value)
        document.getElementById(this.props.id+'select'+newEffect.uiIdx).onchange = () => {
            let value = document.getElementById(this.props.id+'select'+newEffect.uiIdx).value;
            newEffect.feedbackOption = value;

            if(value.includes('eeg')){
                document.getElementById(this.props.id+'channel'+newEffect.uiIdx).style.display = "";
                if(value.includes('coh')) {
                    addCoherenceOptions(this.props.id+'channel'+newEffect.uiIdx,this.session.atlas.data.coherence);
                } else {
                    addChannelOptions(this.props.id+'channel'+newEffect.uiIdx,this.session.atlas.data.eegshared.eegChannelTags);
                }
            } else if (value.includes('heg')) {
                document.getElementById(this.props.id+'channel'+newEffect.uiIdx).style.display = "none";
            }
        }

        if(this.currentShader !== null)
            this.setEffectOptions();


        document.getElementById(this.props.id+'uploadedFile'+idx).onclick = () => {
            if(!window.audio) window.audio = new SoundJS();
            if (window.audio.ctx===null) {return;};

            window.audio.decodeLocalAudioFile((sourceListIdx)=>{ 
                
                newEffect.input.style.display='none';   
                if(!newEffect.controls) {
                    document.getElementById(this.props.id+'effectWrapper'+idx).insertAdjacentHTML('beforeend',controls(idx));
                    newEffect.controls = document.getElementById(this.props.id+'controlWrapper'+idx);
                } else {newEffect.controls.style.display=""}
                newEffect.source = window.audio.sourceList[sourceListIdx]; 
                newEffect.sourceIdx = sourceListIdx;
                document.getElementById(this.props.id+'status'+idx).innerHTML = "Loading..." 

                this.loadSoundControls(newEffect);
                document.getElementById(this.props.id+'status'+idx).innerHTML = "";
            }, 
            ()=> { 
                
            });
            
        }
        
        
    }

    setEffectOptions() {
        this.effects.forEach((e)=>{
            if(!e.id) {
                let sel = document.getElementById(this.props.id+'select'+e.uiIdx);
                for(let i = 0; i < sel.options.length; i++){
                    if(this.currentShader.uniforms.indexOf(sel.options[i].value)>-1){
                        sel.options[i].style.display='';
                    } else if (sel.options[i].value !== 'none') {
                        sel.options[i].style.display='none';
                    }   
                    if(sel.options[i].selected === true && sel.options[i].style.display==='none') {
                        sel.options[0].selected = true;
                    }
                }
            }
        });
    }

    //doSomething(){}
    loadSoundControls = (newEffect) => {
        
        document.getElementById(this.props.id+'play'+newEffect.uiIdx).onclick = () => {
            try{window.audio.playSound(newEffect.sourceIdx,0,true);}catch(er){}
            newEffect.playing = true;
            document.getElementById(this.props.id+'play'+newEffect.uiIdx).style.display = 'none';
            document.getElementById(this.props.id+'mute'+newEffect.uiIdx).style.display = '';
        }

        document.getElementById(this.props.id+'stop'+newEffect.uiIdx).onclick = () => {
            newEffect.playing = false;
            try{window.audio.playSound(newEffect.sourceIdx,0,false);} catch(er) {}
            window.audio.stopSound(newEffect.sourceIdx);
           
            newEffect.input.style.display = "";
            newEffect.controls.style.display = "none";

            let thisidx=0;
            this.effects.forEach((effectStruct,j)=> {
                if(!effectStruct.id) {
                    if(effectStruct.sourceIdx === newEffect.sourceIdx) thisidx = j; 
                    else if(effectStruct.sourceIdx > newEffect.sourceIdx) {
                        effectStruct.sourceIdx--;
                        this.loadSoundControls(effectStruct);
                    }
                }
            });
        }

        document.getElementById(this.props.id+'mute'+newEffect.uiIdx).onclick = () => {
            if(window.audio.sourceGains[newEffect.sourceIdx].gain.value !== 0){
                newEffect.lastGain = window.audio.sourceGains[newEffect.sourceIdx].gain.value;
                window.audio.sourceGains[newEffect.sourceIdx].gain.setValueAtTime(0, window.audio.ctx.currentTime);
                newEffect.muted = true;
                
            } else {  newEffect.muted = false; window.audio.sourceGains[newEffect.sourceIdx].gain.setValueAtTime(newEffect.lastGain, window.audio.ctx.currentTime); }
        }
    };

    animate = () => {
        if(this.looping){
            this.effects.forEach((effectStruct) => {
                let option = effectStruct.feedbackOption;
                if(this.session.atlas.data.heg.length>0) {
                    if(option === 'iHB') { //Heart Beat causing tone to fall off
                        if(this.session.atlas.data.heg[0].beat_detect.beats.length > 0) {
                            this.modifiers.iHB = 1/(0.001*(Date.now()-this.session.atlas.data.heg[0].beat_detect.beats[this.session.atlas.data.heg[0].beat_detect.beats.length-1].t)) 
                            
                            if(!effectStruct.muted && window.audio && effectStruct.playing){
                                window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime( //make the sound fall off on a curve based on when a beat occurs
                                    Math.max(0,Math.min(modifiers.iHB,1)), 
                                    window.audio.ctx.currentTime
                                );
                            } 
                            this.modifiers.iHB = 1/(Date.now()-this.session.atlas.data.heg[0].beat_detect.beats[this.session.atlas.data.heg[0].beat_detect.beats.length-1].t) //heart beat gives a decreasing value starting at 1 which signifies when a heart beat occurred
                        }
                    } else if (option === 'iHR') { //Heart rate modifies play speed
                        if(this.session.atlas.data.heg[0].beat_detect.beats.length > 0) {
                            let hr_mod = 60/this.session.atlas.data.heg[0].beat_detect.beats[this.session.atlas.data.heg[0].beat_detect.beats.length-1].bpm;
                            if(!effectStruct.muted && window.audio && effectStruct.playing){
                                effectStruct.source.playBackRate.value = hr_mod;
                            }
                            this.modifiers.iHR = this.session.atlas.data.heg[0].beat_detect.beats[this.session.atlas.data.heg[0].beat_detect.beats.length-1].bpm;
                        }
                    }
                        else if (option === 'iHEG') { //Raise HEG ratio compared to baseline
                        if(!effectStruct.hegbaseline) effectStruct.hegbaseline = this.session.atlas.data.heg[0].ratio[this.session.atlas.data.heg[0].ratio.length-1];
                        let hegscore = this.session.atlas.data.heg[0].ratio[this.session.atlas.data.heg[0].ratio.length-1]-effectStruct.hegbaseline;
                        if(!effectStruct.muted && window.audio && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(
                                Math.min(Math.max(0,hegscore),1), //
                                window.audio.ctx.currentTime
                            );
                        }
                        this.modifiers.iHEG = hegscore; //starts at 0
                    } else if (option === 'iHRV') { //Maximize HRV, set the divider to set difficulty
                        if(this.session.atlas.data.heg[0].beat_detect.beats.length > 0) {
                            if(!effectStruct.muted && window.audio && effectStruct.playing){
                                window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(
                                    Math.max(0,Math.min(this.session.atlas.data.heg[0].beat_detect.beats[this.session.atlas.data.heg[0].beat_detect.beats.length-1].hrv/30,1)), //
                                    window.audio.ctx.currentTime
                                );
                            }
                            this.modifiers.iHRV = this.getData("iHRV");
                        }
                    } else if (option === 'iBRV') { //Minimize BRV, set the divider to set difficulty
                        if(this.session.atlas.data.heg[0].beat_detect.breaths.length > 0) {
                            if(!effectStruct.muted && window.audio && effectStruct.playing){
                                window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(
                                    Math.max(0,Math.min(1/this.session.atlas.data.heg[0].beat_detect.breaths[this.session.atlas.data.heg[0].beat_detect.breaths.length-1].brv,1)), //
                                    window.audio.ctx.currentTime
                                );
                            }
                            this.modifiers.iBRV = this.session.atlas.data.heg[0].beat_detect.breaths[this.session.atlas.data.heg[0].beat_detect.breaths.length-1].brv;
                        }
                    }
                }
                if(this.session.atlas.settings.eeg === true && this.session.atlas.settings.analyzing === true) { 
                    let channel = document.getElementById(this.props.id+'channel'+effectStruct.uiIdx).value;
                    if (option === 'iDelta') {
                        this.modifiers.iDelta = this.session.atlas.getLatestFFTData(channel)[0].mean.delta;
                        if(!effectStruct.muted && window.audio && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iDelta/50,1)), window.audio.ctx.currentTime); //bandpowers should be normalized to microvolt values, so set these accordingly
                        }
                    } else if (option === 'iTheta') {
                        this.modifiers.iTheta = this.session.atlas.getLatestFFTData(channel)[0].mean.theta;
                        if(!effectStruct.muted && window.audio && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iTheta/30,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iAlpha1') {
                        this.modifiers.iAlpha1 = this.session.atlas.getLatestFFTData(channel)[0].mean.alpha1;
                        if(!effectStruct.muted && window.audio && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iAlpha1/20,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iAlpha2') {
                        this.modifiers.iAlpha2 = this.session.atlas.getLatestFFTData(channel)[0].mean.alpha2;
                        if(!effectStruct.muted && window.audio && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iAlpha2/20,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iBeta') {
                        this.modifiers.iBeta = this.session.atlas.getLatestFFTData(channel)[0].mean.beta;
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iBeta/10,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iGamma') {
                        this.modifiers.iGamma = this.session.atlas.getLatestFFTData(channel)[0].mean.lowgamma;
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iGamma/5,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'i40Hz') {
                        this.modifiers.i40Hz = this.session.atlas.get40HzGamma(this.session.atlas.getEEGDataByChannel(channel))
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.i40Hz*.2,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iThetaBeta') {
                        this.modifiers.iThetaBeta = this.session.atlas.getThetaBetaRatio(this.session.atlas.getEEGDataByChannel(channel))
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iThetaBeta*.5,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iAlpha1Alpha2') {
                        this.modifiers.iAlpha1Alpha2 = this.session.atlas.getAlphaRatio(this.session.atlas.getEEGDataByChannel(channel))
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iAlpha1Alpha2*.5,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iAlphaBeta') {
                        this.modifiers.iAlphaBeta = this.session.atlas.getAlphaBetaRatio(this.session.atlas.getEEGDataByChannel(channel))
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iAlphaBeta*.5,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iAlphaTheta') {
                        this.modifiers.iAlphaTheta = this.session.atlas.getAlphaThetaRatio(this.session.atlas.getEEGDataByChannel(channel))
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iAlphaTheta*.5,1)), window.audio.ctx.currentTime);
                        }      
                    } else if (this.session.atlas.settings.coherence === true && option === 'iAlpha1Coherence') {
                        this.modifiers.iAlpha1Coherence = this.session.atlas.getLatestCoherenceData(channel)[0].mean.alpha1;
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(
                                Math.min(Math.max(0,this.session.atlas.getCoherenceScore(this.session.atlas.getFrontalCoherenceData(),'alpha1')),1), 
                                window.audio.ctx.currentTime
                            );
                        }
                    } else if (option === 'iFFT') {
                        this.modifiers.iFFT = this.getData("iFFT");
                    } 
                }
                if(option === 'iAudio') {
                    if(!effectStruct.muted && window.audio && effectStruct.playing){
                        var array = new Uint8Array(window.audio.analyserNode.frequencyBinCount);
                        window.audio.analyserNode.getByteFrequencyData(array);
                        this.modifiers.iAudio = array.slice(0,256);
                    } else {
                        this.modifiers.iAudio = new Array(256).fill(0);
                    }
                }
            });

            setTimeout(()=>{requestAnimationFrame(this.animate);},16);
        }
    }

    swapShader = () => {

        let newMaterial = new THREE.ShaderMaterial({
            vertexShader: this.currentShader.vertexShader,
            fragmentShader: this.currentShader.fragmentShader,
            side: THREE.DoubleSide,
            transparent: true,
        });
        
        this.updateMaterialUniforms(newMaterial,this.modifiers);
        this.generateGUI(this.currentShader.uniforms)

        this.three.planes.forEach(p => {
            p.material.dispose();
            p.material = newMaterial;          
        })
    }

    getData(u) {        
        if (u === 'iFFT'){
            let channel;
            if(!ch) {
                channel = this.session.atlas.getLatestFFTData()[0];
            } else { channel = this.session.atlas.getLatestFFTData(ch); }
            if(channel) return  channel.fft;
            else return new Array(256).fill(0);
        }
        else if (u === 'iHRV'){
            if (this.session.atlas.data.heg.length > 0) return  this.session.atlas.data.heg[0].beat_detect.beats[this.session.atlas.data.heg[0].beat_detect.beats.length-1].hrv; 
            else return 0;
        }
        // Defaults
        else if (u === 'iTime'){
            return  (Date.now() - this.startTime)/1000; // Seconds
        }
        else if (u === 'iResolution'){
            return  new THREE.Vector2(this.three.meshWidth, this.three.meshHeight);
        }
    }

    updateMaterialUniforms = (material,modifiers={}) => {
        let uniformsToUpdate = JSON.parse(JSON.stringify(this.defaultUniforms));
        this.currentShader.uniforms.forEach((u)=> uniformsToUpdate[u]=0);

        for (let name in uniformsToUpdate){
            let value = uniformsToUpdate[name];

            if (material.uniforms[name] == null) material.uniforms[name] = {}

            /* todo
                add Uniforms for each selector value
            */

            if (Object.keys(this.defaultUniforms).includes(name)){
                material.uniforms[name].value = this.getData(name)
            } else if (material.uniforms[name]) {
                material.uniforms[name].value = modifiers[name];
            } else {
                material.uniforms[name].value = value;
            }
        }

        return material
    }
    


    /* 
    UI Stuff
    */

    // Clear Three.js Scene Completely
    clearThree(){
        for (let i = this.three.scene.children.length - 1; i >= 0; i--) {
            const object = this.three.scene.children[i];
            if (object.type === 'Mesh') {
                object.geometry.dispose();
                object.material.dispose();
            }
            this.three.scene.remove(object);
        }
        this.three.scene = null;
        this.three.renderer.domElement = null;
        this.three.renderer = null;
    }

    generateGUI(uniforms){
        let updateUniformsWithGUI = (key,value) => {
            this.three.planes.forEach(p => {
                if (p.material.uniforms[key] == null) p.material.uniforms[key] = {};
                p.material.uniforms[key].value = value;
            });
            
        }

        let folders = Object.keys(this.gui.__folders)
        if (!folders.includes('Parameters')){
            this.gui.addFolder('Parameters');
        }
        let paramsMenu = this.gui.__folders['Parameters']

        this.guiControllers.forEach(c => {
            paramsMenu.remove(c)
        })
        this.guiControllers = [];        

        for (let name in this.modifiers){
            if(typeof this.modifiers[name] !== 'object' && uniforms.indexOf(name) > -1){
                this.guiControllers.push(
                    paramsMenu.add(
                        this.modifiers, 
                        name, 
                        this.uniformSettings[name].min,
                        this.uniformSettings[name].max,
                        this.uniformSettings[name].step).onChange(
                            (val) => updateUniformsWithGUI(name,val)));
            }
        }    
    }
} 
