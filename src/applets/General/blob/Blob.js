import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import vertexShader from './shaders/blob/vertex.glsl'
import fragmentShader from './shaders/blob/fragment.glsl'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass'


class Blob{

    static id = String(Math.floor(Math.random()*1000000))

    constructor(label, session) {

        // Generic Plugin Attributes
        this.label = label
        this.session = session

        // UI Identifier
        this.props = {
            id: String(Math.floor(Math.random()*1000000)),
            state: null,
            userReadouts: {},
            material: null,
            camera: null,
            effectComposer: null
        }

        this.props.container = document.createElement('div')
        this.props.container.innerHTML = `            
            <div class="brainsatplay-threejs-renderer-container"><canvas class="brainsatplay-threejs-webgl"></canvas></div>
            <div class="brainsatplay-threejs-gui-container"></div>
            <div class="brainsatplay-neurofeedback-container" style="position: absolute; top: 25px; left: 25px;"></div>`

        this.props.container.id = this.props.id
        this.props.container.classList.add('brainsatplay-threejs-wrapper')
        this.props.container.style = `height:100%; width:100%; `
        this.props.container.onresize = this.responsive

        // Port Definition
        this.ports = {
            default: {
                input: {type: 'number'},
                output: {type: null},
                onUpdate: (user) => {      
                    if (this.props.material) { 
                        // this.feedbackHistory.push(user.data)
                        // let updateValue = this.ports.upperBound.data-this.normalize(user.data, Math.min(...this.feedbackHistory), Math.max(...this.feedbackHistory), this.ports.upperBound.data, this.ports.lowerBound.data)
                        if (!isNaN(user.data)) this.props.material.uniforms.uNoiseIntensity.value = 1 - user.data 
                    } // update blob noise given new feedback samples      
                },
            },

            upperBound: {
                data: 1,
                input: {type: 'number'},
                output: {type: null},
            },

            lowerBound: {
                data: 0,
                input: {type: 'number'},
                output: {type: null},
            },


            element: {
                data: this.props.container,
                input: {type: null},
                output: {type: Element},
            }
        }
    }

    init = () =>  {    

        let canvas = this.props.container.querySelector('canvas.brainsatplay-threejs-webgl')
        canvas.style.opacity = '1.0'
        canvas.style.transition = 'opacity 1s'
        
        /**
         * Scene
         */
        const scene = new THREE.Scene()
        // // const light = new THREE.AmbientLight(0x00b3ff);
        // const light = new THREE.AmbientLight(0xffffff);
        // light.position.set(0, 5, 10);
        // light.intensity = 1.4;
        // scene.add(light);
        
        /**
         * Camera
         */
        let baseCameraPos = new THREE.Vector3(0,0,20)
        this.props.camera = new THREE.PerspectiveCamera(75, this.props.container.offsetWidth / this.props.container.offsetHeight, 0.01, 1000)
        this.props.camera.position.z = baseCameraPos.z
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true
        })
        
        // Renderer
        this.renderer.setSize(this.props.container.offsetWidth, this.props.container.offsetHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
        this.props.container.querySelector('.brainsatplay-threejs-renderer-container').appendChild(this.renderer.domElement)
        
        /** 
         * Postprocessing 
         **/
        
         // Render Target
        
         let RenderTargetClass = null
        
         if(this.renderer.getPixelRatio() === 1 && this.renderer.capabilities.isWebGL2)
         {
             RenderTargetClass = THREE.WebGLMultisampleRenderTarget
         }
         else
         {
             RenderTargetClass = THREE.WebGLRenderTarget
         }
        
         const renderTarget = new RenderTargetClass(
            window.innerWidth , window.innerHeight,
            {
                minFilter: THREE.LinearFilter,
                maxFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                encoding: THREE.sRGBEncoding,
                type: THREE.HalfFloatType // For Safari (doesn't work)
            }
         )
        
         // Composer
         this.props.effectComposer = new EffectComposer(this.renderer,renderTarget)
         this.props.effectComposer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
         this.props.effectComposer.setSize(this.props.container.offsetWidth, this.props.container.offsetHeight)
        
         // Passes
        const renderPass = new RenderPass(scene, this.props.camera)
        this.props.effectComposer.addPass(renderPass)
        
        const bloomPass = new UnrealBloomPass()
        bloomPass.enabled = true
        // bloomPass.strength = 0.5
        bloomPass.radius = 1
        // bloomPass.threshold = 0.6
        this.props.effectComposer.addPass(bloomPass)
        
        // Antialiasing
        if(this.renderer.getPixelRatio() === 1 && !this.renderer.capabilities.isWebGL2)
        {
            const smaaPass = new SMAAPass()
            this.props.effectComposer.addPass(smaaPass)
            console.log('Using SMAA')
        }
        
        
        // Controls
        const controls = new OrbitControls(this.props.camera, this.renderer.domElement)
        controls.screenSpacePanning = true
        controls.enableDamping = true
        controls.enabled = true;
        
        
        // Plane
        const geometry = generateGeometry()
        
        let tStart = Date.now()
        
        // const material = new THREE.MeshNormalMaterial( );
        
        var materialControls = new function () {
            this.rPower = 0.0;
            this.gPower = 0.85;
            this.bPower = 1.0;
            this.alpha = 1.0;
            this.noiseIntensity = 0.5;
        
            this.updateColor = function () {
                this.props.material.uniforms.uColor.value = [
                    materialControls.rPower,
                    materialControls.gPower,
                    materialControls.bPower,
                    materialControls.alpha
                ]
            };
        
            this.updateNoise = function () {
                this.props.material.uniforms.uNoiseIntensity.value = materialControls.noiseIntensity
            };
        };
        
        
        this.props.material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            // wireframe: true,
            blending: THREE.AdditiveBlending,
            uniforms:
            {
                uTime: { value: 0 },
                uColor: {value: [materialControls.rPower,materialControls.gPower,materialControls.bPower,materialControls.alpha] },
                uNoiseIntensity: {value: materialControls.noiseIntensity}
            }
        })
        
        
        // Mesh
        const mesh = new THREE.Mesh(geometry, this.props.material)
        scene.add(mesh)
        
        // let colorMenu = gui.addFolder('Color');
        // colorMenu.add(materialControls, 'rPower', 0, 1).onChange(materialControls.updateColor);
        // colorMenu.add(materialControls, 'gPower', 0, 1).onChange(materialControls.updateColor);
        // colorMenu.add(materialControls, 'bPower', 0, 1).onChange(materialControls.updateColor);
        
        // let offsetMenu = gui.addFolder('Noise');
        // offsetMenu.add(materialControls, 'noiseIntensity', 0, 1).onChange(materialControls.updateNoise);
        
        
        function generateGeometry() {
            let diameter = 7
            return new THREE.SphereGeometry(diameter,Math.pow(2,6), Math.pow(2,6));
        }
        
        // function regenerateGeometry() {
        //     let newGeometry = generateGeometry()
        //     mesh.geometry.dispose()
        //     mesh.geometry = newGeometry
        // }
        
        // Animate
        var animate = () => {
        
            // Limit Framerate
            setTimeout( () => {
                this.props.material.uniforms.uTime.value = Date.now() - tStart
                controls.update()
                this.props.effectComposer.render()
            }, 1000 / 60 );
        };
        
        
        // // Stats
        // const stats = Stats()
        // appletContainer.appendChild(stats.dom)
        
        this.renderer.setAnimationLoop( animate );
        
        setTimeout(() => {
            canvas.style.opacity = '1'
        }, 100)
    }

    deinit = () => {

        this.renderer.setAnimationLoop( null );
    }

    responsive = () => {
        // Resize
        this.props.camera.aspect = this.props.container.offsetWidth / this.props.container.offsetHeight
        this.props.camera.updateProjectionMatrix()
        this.renderer.setSize(this.props.container.offsetWidth, this.props.container.offsetHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.props.effectComposer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.props.effectComposer.setSize(this.props.container.offsetWidth, this.props.container.offsetHeight)
    }
}

export {Blob}