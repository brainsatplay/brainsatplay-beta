import {brainsatplay} from '../../brainsatplay'
import {DOMFragment} from '../../frontend/utils/DOMFragment'

import './style.css'
import * as THREE from 'three'
import {UserMarker} from './UserMarker'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Stats from 'three/examples/jsm/libs/stats.module'
import mapVertexShader from './shaders/map/vertex.glsl'
import mapFragmentShader from './shaders/map/fragment.glsl'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass'
import { GlitchPass } from './postprocessing/CustomGlitchPass'
// import { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass'
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass'
import { gsap } from 'gsap'
import mapTexture from "./img/mapTexture.jpeg"
import mapDisp from "./img/mapDisplacement.jpeg"
// import * as p5 from 'p5'
// console.log(p5.noise)

//Example Applet for integrating with the UI Manager
export class NexusApplet {

    static devices = ['eeg'] //,heg

    constructor(
        parent=document.body,
        bci=new brainsatplay(),
        settings=[]
    ) {
    
        //-------Keep these------- 
        this.parentNode = parent;
        this.settings = settings;
        this.bci = bci; //Reference to the brainsatplay session to access data and subscribe
        this.AppletHTML = null;
        //------------------------

        this.props = { //Changes to this can be used to auto-update the HTML and track important UI values 
            id: String(Math.floor(Math.random()*1000000)), //Keep random ID
            //Add whatever else
        };

        //etc..

    }

    //---------------------------------
    //---Required template functions---
    //---------------------------------

    //Initalize the app with the DOMFragment component for HTML rendering/logic to be used by the UI manager. Customize the app however otherwise.
    init() {

        //HTML render function, can also just be a plain template string, add the random ID to named divs so they don't cause conflicts with other UI elements
        let HTMLtemplate = (props=this.props) => { 
            return `
            <div id='${props.id}' class="nexus-wrapper" style='height:${props.height}; width:${props.width};'>
                <div id="nexus-renderer-container"><canvas class="nexus-webgl"></canvas>                </div>
                <div class="nexus-loading-bar"></div>
                <div class="nexus-point-container"></div>
                <div id="nexus-gameHero" class="nexus-container">
                <div>
                <h1>Nexus</h1>
                <p>Neurofeedback + Group Meditation</p>
                </div></div>
            </div>
            `;
        }

        //HTML UI logic setup. e.g. buttons, animations, xhr, etc.
        let setupHTML = (props=this.props) => {
            document.getElementById(props.id);
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



/**
 * Nexus: Neurofeedback + Group Meditation
 */

// Raycaster
const raycaster = new THREE.Raycaster()

// Loading Manager
const loadingBarElement = document.querySelector('.nexus-loading-bar')

const loadingManager = new THREE.LoadingManager(
    // Loaded
    () => {
        renderer.setSize(nexusContainer.clientWidth, nexusContainer.clientHeight);
        canvas.style.display = 'block'
        gsap.delayedCall(3.0,() => 
        {
        gsap.to(overlayMaterial.uniforms.uAlpha, { duration: 3, value: 0 })
        loadingBarElement.classList.add('ended')
        loadingBarElement.style.transform = ''
        let hero = document.getElementById("nexus-gameHero")
        // Check if Nexus HTML still exists
        if (hero){
            hero.style.opacity = 0;
            getGeolocation()
            gsap.delayedCall(0.5,() => 
            {
                // Get My Location
                getGeolocation()
                glitchPass.enabled = true
                glitchPass.lastGlitchTime = Date.now();
                controls.enabled = true;
            })
        }
    })
    },

    // Progress
    (itemURL, itemsLoaded, itemsTotal) => {
        loadingBarElement.style.transform = `scaleX(${itemsLoaded/itemsTotal})`
    }
)
// const gltfLoader = new GLTFLoader(loadingManager)
// const cubeTextureLoader = new THREE.CubeTextureLoader(loadingManager)
// Textures
const textureLoader = new THREE.TextureLoader(loadingManager)
const texture = textureLoader.load(mapTexture)
// const futuristicInterface = textureLoader.load('./textures/interfaceNormalMap.png')
const displacementMap = textureLoader.load(mapDisp)

// const matcapTexture = textureLoader.load('./textures/matcaps/8.png')

// // Text
// const fontLoader = new THREE.FontLoader()
// fontLoader.load('/fonts/helvetiker_regular.typeface.json', (font) => {
//     points.forEach((point,name) => {

//         const textGeometry = new THREE.TextBufferGeometry(
//             name,
//             {
//                 font: font,
//                 size: 0.5/10,
//                 height: 0.2/10,
//                 curveSegments: 5,
//                 bevelEnabled: true,
//                 bevelThickness: 0.03/10,
//                 bevelSize:0.02/10,
//                 bevelOffset:0,
//                 bevelSegments: 4
//             }
//         )
//         textGeometry.computeBoundingBox()
//         textGeometry.center()
//         const textMaterial = new THREE.MeshMatcapMaterial({matcap: matcapTexture})
//         const text = new THREE.Mesh(textGeometry, textMaterial)
//         text.position.set(point.x, point.y, 0.1)
//         scene.add(text)
//     })
// })

/**
 * Canvas
 */
const nexusContainer = document.getElementById(this.props.id)
let canvas = document.querySelector('canvas.nexus-webgl')

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
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000)
camera.position.z = 3

const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true
})

/**
 * Texture Params
 */
 let imageWidth = 1200
 let imageHeight = 600
 const segmentsX = 400
 const imageAspect = imageWidth/imageHeight
 let fov_y = camera.position.z * camera.getFilmHeight() / camera.getFocalLength();
 let meshWidth = (fov_y  - 1.0)* camera.aspect;
 let meshHeight = meshWidth / imageAspect;

/**
 * Overlay
 */
const overlayGeometry = new THREE.PlaneGeometry(meshWidth, fov_y, 1, 1)
const overlayMaterial = new THREE.ShaderMaterial({
    transparent: true,
    uniforms:
    {
        uAlpha: { value: 1 }
    },
    vertexShader: `
        void main()
        {
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float uAlpha;
    
        void main()
        {
            gl_FragColor = vec4(0.0, 0.0, 0.0, uAlpha);
        }
    `
})
const overlay = new THREE.Mesh(overlayGeometry, overlayMaterial)
overlay.position.z = camera.position.z - 0.1;
scene.add(overlay)

// Renderer
renderer.setSize(nexusContainer.clientWidth, nexusContainer.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
document.getElementById('nexus-renderer-container').appendChild(renderer.domElement)
canvas = document.querySelector('canvas.nexus-webgl')
canvas.style.display = 'none'
// GUI
// const gui = new dat.GUI({width: 400});

/** 
 * Postprocessing 
 **/

 // Render Target

 let RenderTargetClass = null

 if(renderer.getPixelRatio() === 1 && renderer.capabilities.isWebGL2)
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
const effectComposer = new EffectComposer(renderer,renderTarget)
effectComposer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
effectComposer.setSize(nexusContainer.clientWidth, nexusContainer.clientHeight)

 // Passes
const renderPass = new RenderPass(scene, camera)
effectComposer.addPass(renderPass)

// const effectGrayScale = new ShaderPass( LuminosityShader );
// effectComposer.addPass( effectGrayScale );

// const effectSobel = new ShaderPass( SobelOperatorShader );
// effectSobel.uniforms[ 'resolution' ].value.x = window.innerWidth * window.devicePixelRatio;
// effectSobel.uniforms[ 'resolution' ].value.y = window.innerHeight * window.devicePixelRatio;
// effectComposer.addPass( effectSobel );

const glitchPass = new GlitchPass()
glitchPass.goWild = false
glitchPass.enabled = false
effectComposer.addPass(glitchPass)

const shaderPass = new ShaderPass(RGBShiftShader)
shaderPass.enabled = true
effectComposer.addPass(shaderPass)

const bloomPass = new UnrealBloomPass()
bloomPass.enabled = true
// bloomPass.strength = 0.5
// bloomPass.radius = 1
// bloomPass.threshold = 0.6
effectComposer.addPass(bloomPass)

// // Custom Shader Pass
// const customPass = new ShaderPass({
//     uniforms: {
//         tDiffuse: { value: null },
//         uInterfaceMap: { value: null }
//     },
//     vertexShader: interfaceVertexShader,
//     fragmentShader: interfaceFragmentShader
// })
// customPass.material.uniforms.uInterfaceMap.value = futuristicInterface
// effectComposer.addPass(customPass)

// Antialiasing
if(renderer.getPixelRatio() === 1 && !renderer.capabilities.isWebGL2)
{
    const smaaPass = new SMAAPass()
    effectComposer.addPass(smaaPass)
    console.log('Using SMAA')
}


// Controls
const controls = new OrbitControls(camera, renderer.domElement)
controls.screenSpacePanning = true
controls.enableDamping = true
controls.enabled = false;

//controls.addEventListener('change', render)

// Mouse
const mouse = new THREE.Vector2()
nexusContainer.addEventListener('mousemove', (e) => {
    mouse.x = (e.layerX/nexusContainer.clientWidth) * 2 - 1
    mouse.y = -(e.layerY/nexusContainer.clientHeight) * 2 + 1
})


nexusContainer.addEventListener('click', () => {
    if (currentIntersect){
        currentIntersect.object.material.opacity = 1.0 
    }
})

// Set Default Users
let points = new Map()
let diameter = 1e-2/4;
points.set('me',new UserMarker({name: 'me',diameter:diameter, meshWidth:meshWidth, meshHeight:meshHeight, neurofeedbackDimensions: Object.keys(this.bci.atlas.data.eeg[0].means)}))
points.set('Los Angeles',new UserMarker({latitude: 34.0522, longitude: -118.2437, diameter:diameter, meshWidth:meshWidth, meshHeight:meshHeight, neurofeedbackDimensions: Object.keys(this.bci.atlas.data.eeg[0].means)})); // LA
points.set('Somewhere',new UserMarker({latitude: 0, longitude: 0, diameter:diameter, meshWidth:meshWidth, meshHeight:meshHeight, neurofeedbackDimensions: Object.keys(this.bci.atlas.data.eeg[0].means)})); // LA

// let la = points.get('Los Angeles')

// Plane
const planeGeometry = new THREE.PlaneGeometry(meshWidth, meshHeight, segmentsX, segmentsX/imageAspect)
let tStart = Date.now()
//  let point1 = {
//     position: new THREE.Vector2(NaN,NaN)
//  }
//  let pointArr = new Float32Array() //[point1]
//  pointArr[0] = NaN
//  pointArr[1] = NaN

let colorReachBase = 0.030;
const material = new THREE.ShaderMaterial({
    vertexShader: mapVertexShader,
    fragmentShader: mapFragmentShader,
    transparent: true,
    wireframe: true,
    blending: THREE.AdditiveBlending,
    uniforms:
    {
        // points: { value: pointArr },
        // count: {value: pointArr.length/2 },
        point: { value: new THREE.Vector2(NaN,NaN) },
        count: {value: 1 },
        uTime: { value: 0 },
        uTexture: { value: texture },
        displacementMap: { value: displacementMap },
        displacementHeight: { value: 0.04 },
        colorThreshold: { value: colorReachBase},
        aspectRatio: {value: window.innerWidth / window.innerHeight}
        // colorThreshold: { value: new THREE.Vector2(0.05*window.innerWidth,0.05*window.innerHeight) },
    }
})



// Mesh
const plane = new THREE.Mesh(planeGeometry, material)
scene.add(plane)

// Resize
this.resizeNexus = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    meshWidth = (fov_y  - 1.0)* camera.aspect;
    meshHeight = meshWidth / imageAspect
    regeneratePlaneGeometry()
    points.forEach(point => {
        if (point.active){
            point.updateMesh(meshWidth,meshHeight)
            let screenPos = point.marker.position.clone()
            screenPos.project(camera)
            let translateX = nexusContainer.clientWidth * screenPos.x * 0.5
            point.element.style.transform = `translate(${translateX}px)`
            let translateY = nexusContainer.clientHeight * screenPos.y * 0.5
            point.element.style.transform = `translate(${translateY}px)`
            if (point.name == 'me'){
                material.uniforms.point.value = new THREE.Vector2(point.x,point.y)
                material.uniforms.aspectRatio.value = window.innerWidth / window.innerHeight
                controls.target.set(point.x,point.y,point.z)
            }
        }
    })
    drawCylinder()
    renderer.setSize(nexusContainer.clientWidth, nexusContainer.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    effectComposer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    effectComposer.setSize(nexusContainer.clientWidth, nexusContainer.clientHeight)

}

window.addEventListener('resize', this.resizeNexus, 
false)

function regeneratePlaneGeometry() {
    let newGeometry = new THREE.PlaneGeometry(
        meshWidth, meshHeight, segmentsX, segmentsX/imageAspect
    )
    plane.geometry.dispose()
    plane.geometry = newGeometry
}

// Animate
let currentIntersect = null
let coherence = 0;
var animate = () => {

    // Limit Framerate
    setTimeout( function() {
        requestAnimationFrame( animate );
    }, 1000 / 60 );

    animateUsers()
    material.uniforms.uTime.value = Date.now() - tStart
    points.forEach(point => {
        point.animateLabel(camera,nexusContainer)
    })
    // stats.update()
    controls.update()
    // renderer.render(scene, camera)
    effectComposer.render()
};


// Stats
// const stats = Stats()
// document.body.appendChild(stats.dom)

// Draw Shapes
const animateUsers = () => {
    raycaster.setFromCamera(mouse,camera)
    const objectArray = Array.from( points.keys() ).map(key => points.get(key).marker)
    const intersects = raycaster.intersectObjects(objectArray)

    if (intersects.length){
        if (currentIntersect === null){
            const scale = intersects[0].object.scale
            intersects[0].object.scale.set(scale.x*2,scale.y*2,scale.z*2)
            intersects[0].object.material.opacity = 0.75
        }
        currentIntersect = intersects[0]
        
    } else {
        if (currentIntersect !== null){
            const scale = currentIntersect.object.scale
            currentIntersect.object.scale.set(scale.x/2,scale.y/2,scale.z/2)
            currentIntersect.object.material.opacity = 0.50
        }
        currentIntersect = null;
    }

    points.forEach(point => {

        // Remove old marker
        point.prevMarkers.forEach((obj) => {
            obj.geometry.dispose();
            obj.material.dispose();
            scene.remove( obj );
        })

        point.prevGroups.forEach((group) => {
            scene.remove( group );
        })

        // Add new marker
        scene.add(point.marker)
        scene.add(point.neurofeedbackGroup)
        point.neurofeedbackGroup.rotateZ(0.01);
    })

    let me = points.get('me')
    let atlas = this.bci.atlas
    let channelTags = atlas.data.eegshared.eegChannelTags;
    let scaling = {}
    let myAlphaCoherence = []
    // init
    me.neurofeedbackDimensions.forEach(key => {
        scaling[key] = []
    })

    // populate
    channelTags.forEach(row => {
        let coord = atlas.getEEGDataByTag(row.tag)
        if (coord){
            me.neurofeedbackDimensions.forEach(key => {
                if (coord.means[key].length != 0) scaling[key].push(coord.means[key][coord.means[key].length-1])
            })
        }
    })
    me.neurofeedbackDimensions.forEach(key => {
        let nfscale = scaling[key].length > 1 ? (1/4) * scaling[key].reduce((tot,curr)=> tot + curr) / scaling[key].length : 1
        me.neurofeedbackGroup.getObjectByName(key).scale.set(nfscale,nfscale,nfscale)
        if (key = 'alpha1'){
            if(this.bci.atlas.settings.coherence) {
                let coherenceBuffer = this.bci.atlas.data.coherence[0].means['alpha1']
                if(coherenceBuffer.length > 0) {
                    coherence = 1000*coherenceBuffer[coherenceBuffer.length-1] ?? 1
                }
            }
        }
        material.uniforms.colorThreshold.value = colorReachBase*nfscale
    })

    // coherence
    // coherence = 0.5 + Math.sin(Date.now()/1000)/2;
    let coherenceLine = scene.getObjectByName('coherenceLine')
    if (coherenceLine) {
        coherenceLine.material.opacity = coherence
    }
}

function drawCylinder() {
    let coherenceLine = scene.getObjectByName('coherenceLine')
    if (coherenceLine) {
        coherenceLine.geometry.dispose()
        coherenceLine.material.dispose()
        scene.remove(coherenceLine)
    }
    const pointPositions = []
    points.forEach(point => {
        if (pointPositions.length < 2){
            pointPositions.push(point.marker.position)
        }
    })
    let direction = new THREE.Vector3().subVectors( pointPositions[1], pointPositions[0] );
    if (!isNaN(direction.length())){
        const lineGeometry = new THREE.CylinderGeometry( 0.0005, 0.0005,  direction.length(), 32 );
        lineGeometry.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI/2));
        const lineMaterial = new THREE.MeshBasicMaterial( {
            color: 0xff00ff,
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity:1
        } );
        const edge = new THREE.Mesh( lineGeometry, lineMaterial);
        edge.name = 'coherenceLine'
        let edgeCenter = new THREE.Vector3().addVectors( pointPositions[0], direction.multiplyScalar(0.5))
        edge.position.set(edgeCenter.x,edgeCenter.y,edgeCenter.z)
        edge.lookAt(pointPositions[1]);
        scene.add(edge)
    }
}

// Geolocation
function getGeolocation(){
    navigator.geolocation.getCurrentPosition(
       // Success   
    (pos) => {
        points.get('me').setGeolocation(pos.coords)
        let me = points.get('me')
        // material.uniforms.points.value[0]= {
        //     position: new THREE.Vector2(me.x,me.y)
        //  }
        // draw line
        drawCylinder()
         material.uniforms.point.value = new THREE.Vector2(me.x,me.y)
         controls.target.set(me.x,me.y,me.z)
         camera.position.set(me.x,me.y)
    }, 
    // Error
    (err) => {
        console.warn(`ERROR(${err.code}): ${err.message}`);
    }, 
    // Options
    {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });
}
animate();
    }

    //Delete all event listeners and loops here and delete the HTML block
    deinit() {
        this.AppletHTML.deleteNode();
        //Be sure to unsubscribe from state if using it and remove any extra event listeners
    }

    //Responsive UI update, for resizing and responding to new connections detected by the UI manager
    responsive() {
        this.resizeNexus()
        // const canvas = document.querySelector('canvas.nexus-webgl')
        // canvas.width = this.AppletHTML.node.clientWidth;
        // canvas.height = this.AppletHTML.node.clientHeight;
    }

    configure(settings=[]) { //For configuring from the address bar or saved settings. Expects an array of arguments [a,b,c] to do whatever with
        settings.forEach((cmd,i) => {
            //if(cmd === 'x'){//doSomething;}
        });
    }

    //--------------------------------------------
    //--Add anything else for internal use below--
    //--------------------------------------------

    //doSomething(){}
} 