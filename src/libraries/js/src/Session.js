/*
//By Joshua Brewster, Garrett Flynn (GPL)

Stack notes:
Data Streams
- Local hardware
  -- Serial
  -- BLE
  -- Sockets/SSEs
- Server
  -- Hardware and Session state data via Websockets

Data Processing 
- eegworker.js, eegmath, bcijs, etc.

Data State
- Sort raw/filtered data
- Sort processed data
- Handle streaming data from other users

UI Templating
- StateManager.js
- UIManager.js
- ObjectListener.js
- DOMFragment.js

Local Storage
- BrowserFS for IndexedDB
- CSV saving/parsing

Frontend Execution
- UI State
- Server State
- Session/App State(s)

*/
import 'regenerator-runtime/runtime' //fixes async calls in this bundler


 // Default CSS Stylesheet
 import './ui/styles/defaults.css'

// UI
import { DOMFragment } from './ui/DOMFragment';

// Managers
import { StateManager } from './ui/StateManager'
import { DataAtlas } from './DataAtlas'

// Device Plugins
import { deviceList } from './devices/deviceList';

// Plugins
import {GraphManager} from './GraphManager'

// Event Router
import { EventRouter } from './EventRouter'

// Data Manager
import { DataManager } from './utils/DataManager'

// Project Manager
import { Application } from './Application'
import { ProjectManager } from './utils/ProjectManager'

// MongoDB Realm
import { LoginWithGoogle, LoginWithRealm } from './ui/login';
import * as Realm from "realm-web";

export let DataMgr = null;

/**
 * ```javascript
 * import {Session} from 'brainsatplay'
 * ```
 */

export class Session {
	/**
     * @constructor 
     * @alias module:brainsatplay.Session
     * @description Class for server/socket connecting and macro controls for device streaming and data accessibilty.
     * @param {string} username Username
     * @param {string} password Password
     * @param {string} urlToConnect URL to connect to 
	 * @example session = new Session();
     */

	/**
	* ```javascript
	* let session = new Session();
	* ```
	*/

	constructor(
		username = 'guest',
		password = '',
		urlToConnect = 'https://brainsatplay.azurewebsites.net',//'https://server.brainsatplay.com'
		initFS = false
		) {
		this.deviceStreams = [];
		this.state = new StateManager({
			commandResult: {},
			sessionInfo: undefined,
		});

		this.atlas = new DataAtlas('atlas', undefined, undefined, true, false);

		this.info = {
			nDevices: 0,
			auth: {
				url: new URL(urlToConnect),
				username: username,
				password: password,
				connected: false
			},
			apps: {},
			subscriptions: [],
		}

		this.id = Math.floor(Math.random() * 10000) // Give the session an ID
		this.socket = null;
		this.streamObj = new streamSession(this.info);
		this.streamObj.deviceStreams = this.deviceStreams; //reference the same object

		this.graph = new GraphManager(this)
		this.dataManager = new DataManager(this);

		DataMgr = this.dataManager;

		if(initFS) this.initFS();
		
		this.projects = new ProjectManager(this)
	}

	/**
     * @method module:brainsatplay.Session.setLoginInfo
     * @description Set user information.
     * @param {string} username Username.
     * @param {string} password Password.
     * @param {string} appname Name of the app.
     */

	setLoginInfo(username = 'guest', password = '') {
		this.info.auth.username = username;
		this.info.auth.password = password;
	}

	/**
     * @method module:brainsatplay.Session.setLoginInfo
     * @description Connect local device and add it. Use [reconnect()]{@link module:brainsatplay.Session.reconnect} if disconnecting and reconnecting device in same session.
     * @param {string} device "freeeeg32", "freeeeg32_19", "muse", "notion"
     * @param {array} analysis "eegfft", "eegcoherence", etc
	 * @param {callback} onconnect Callback function on device connection. Subscribe to device outputs after connection completed.
     * @param {callback} ondisconnect Callback function on device disconnection. Unsubscribe from outputs after device is disconnected.
     * @param {boolean} streaming Set to stream to server (must be connected)
     * @param {array} streamParams e.g. [['eegch','FP1','all']]
     * @param {boolean} useFilters Filter device output if it needs filtering (some hardware already applies filters so we may skip those).
     * @param {boolean} pipeToAtlas Send data to atlas.
	 */

	//
	async connect(
		device = "freeeeg32_2",
		analysis = ['eegfft'],
		onconnect = () => { },
		ondisconnect = () => { },
		streaming = false,
		streamParams = [], // [ ['eegch','FP1','all'] ]
		useFilters = true,
		pipeToAtlas = true
	) {

		if (streaming === true) {
			if (this.socket == null || this.socket.readyState !== 1) {
				console.error('Server connection not found, please run login() first');
				return false;
			}
		}

		if (this.deviceStreams.length > 0) {
			if (device.indexOf('heg') > -1) {
				let found = this.deviceStreams.find((o, i) => { //multiple EEGs get their own atlases just to uncomplicate things. Will need to generalize more later for other multi channel devices with shared preconfigurations if we want to try to connect multiple
					if (o.deviceType === 'eeg') {
						return true;
					}
				});
				if (!found) pipeToAtlas = this.deviceStreams[0].device.atlas;
			}
		}

		let newStream;

		if (device.includes('brainstorm')) {
			newStream = new deviceStream(
				device,
				analysis,
				useFilters,
				pipeToAtlas,
				this.info.auth,
				this
			)
		} else {
			newStream = new deviceStream(
				device,
				analysis,
				useFilters,
				pipeToAtlas,
				this.info.auth
			)
		}

		let i = this.deviceStreams.length;
		let stateId = "device" + (i)

		newStream.onconnect = () => {
			this.deviceStreams.push(newStream);
			if (this.deviceStreams.length === 1) this.atlas = this.deviceStreams[0].device.atlas; //change over from dummy atlas
			
			this.info.nDevices++;
			if (streamParams[0]) this.beginStream(streamParams); 
			newStream.info.stateId = stateId
			this.state.addToState(stateId, newStream.info); //Device info accessible from state

			onconnect(newStream);
			this.onconnected();
			//console.log(this.deviceStreams)
			//console.log(this.state.data)
			//console.log(this.atlas)
		}

		newStream.ondisconnect = () => {
			ondisconnect(newStream);
			this.ondisconnected();
			if (this.deviceStreams[i]) {
				this.deviceStreams[i].device.atlas.deinit()
				this.deviceStreams.splice(i, 1);
			}
			this.state.removeState(stateId)

			if (this.deviceStreams.length > 1) this.atlas = this.deviceStreams[0].device.atlas;
			if (this.deviceStreams.length == 0) this.stopAnalysis()
			this.info.nDevices--;
			//console.log(this.deviceStreams)
			//console.log(this.state.data)
			//console.log(this.atlas)
		}

		// Wait for Initialization before Connection
		await newStream.init();
		await newStream.connect()

		// Initialize Route Management Interface
		let contentChild = document.getElementById(`brainsatplay-device-${device.split('_')[0]}`)

		if (Object.keys(newStream.info.events.routes).length > 0){
			newStream.configureRoutes(contentChild)
			for (let id in this.info.apps){
				newStream.info.events.addApp(id, this.info.apps[id].controls)
			}
			
			newStream.info.events.updateRouteDisplay()
		}

		// Trigger Updates to Analysis Functions
		this.updateApps()

		return newStream
	}

	onconnected = () => { }

	ondisconnected = () => { }


	/**
     * @method module:brainsatplay.Session.reconnect
     * @description Reconnect a device that has already been added.
     * @param {int} deviceIdx Index of device.
	 * @param {callback} onconnect Callback function on device reconnection. 
	 */
	reconnect(deviceIdx = this.deviceStreams.length - 1, onconnect = () => { }) {
		if (deviceIdx > -1) {
			this.deviceStreams[deviceIdx].connect();
			onconnect();
		} else { console.log("No devices connected"); }
	}

	/**
     * @method module:brainsatplay.Session.disconnect
     * @description Disconnect local device.
     * @param {int} deviceIdx Index of device.
	 * @param {callback} ondisconnect Callback function on device disconnection. 
	 */
	disconnect(deviceIdx = this.deviceStreams.length - 1, ondisconnect = () => { }) {
		if (deviceIdx > -1) {
			this.deviceStreams[deviceIdx].disconnect();
			ondisconnect();
		} else { console.log("No devices connected"); }
	}

	// Check if Chrome
	checkIfChrome = () => {
		// https://stackoverflow.com/questions/4565112/javascript-how-to-find-out-if-the-user-browser-is-chrome/13348618#13348618
		let isChromium = window.chrome;
		let winNav = window.navigator;
		let vendorName = winNav.vendor;
		let isOpera = typeof window.opr !== "undefined";
		let isIEedge = winNav.userAgent.indexOf("Edge") > -1;
		let isIOSChrome = winNav.userAgent.match("CriOS");
	
		if (isIOSChrome) {
			return true
		} else if(
		isChromium !== null &&
		typeof isChromium !== "undefined" &&
		vendorName === "Google Inc." &&
		isOpera === false &&
		isIEedge === false
		) {
			return true
		} else { 
			return false
		}
	}

	/**
     * @method module:brainsatplay.Session.connectDevice
     * @description Generate DOM fragment with a selector for available devices.
	 * @param {HTMLElement} parentNode Parent node to insert fragment into.
	 * @param {HTMLElement} toggleButton Node of button to toggle
	 * @param {callback} onconnect Callback function on device connection. 
	 * @param {callback} ondisconnect Callback function on device disconnection. 
	 */

	connectDevice(parentNode = document.body, toggleButton=null, deviceFilter = null, autosimulate = false, onconnect = () => { }, ondisconnect = () => { }) {
		
		if (typeof toggleButton === 'string'){
			toggleButton = toggleButton.getElementById(toggleButton)
		}

		// Apply User Filter
		let newDeviceList = (deviceFilter != null) ? deviceList.filter(d => deviceFilter.includes(d.name)) : deviceList

		// Apply Browser Filter
		if (!this.checkIfChrome())  newDeviceList = newDeviceList.filter(d => d.chromeOnly != true)
		

			let template = () => {return `
			<div id="${this.id}DeviceSelection"  class="brainsatplay-default-menu" style="z-index: 999; width: 100vw; height: 100vh; position: absolute; top: 0; left: 0; opacity: 0; pointer-events: none; transition: opacity 1s;">
				<div style="width: 100%; height: 100%; background: black; opacity: 0.8; position: absolute; top: 0; left: 0;"></div>
				<div class="main" style="padding: 50px; width: 100%; height: 100%; position: absolute; top: 0; left: 0;">
					<div class="brainsatplay-header-grid"><h1>Device Manager</h1><button id="${this.id}deviceSelectionClose" class='brainsatplay-default-button'>Close</button></div>
					<hr>
					<div class="brainsatplay-device-gallery" style="overflow-y: scroll;"></div>
				</div>
			</div>
			`}

			let setup = () => {

			let deviceSelection = document.getElementById(`${this.id}DeviceSelection`)
			let deviceGallery = deviceSelection.querySelector(`.brainsatplay-device-gallery`)
			let closeButton = document.getElementById(`${this.id}deviceSelectionClose`)

			const resizeDisplay = () => {
				let main = deviceSelection.querySelector(`.main`)
				deviceGallery.style.height = `${window.innerHeight - parseInt(main.style.padding.replace('px','')) - (deviceGallery.offsetTop)}px`
				// deviceGallery.style.height = `${window.innerHeight - 2 * main.style.padding - (deviceGallery.offsetTop)}px`
			}
			resizeDisplay()

			window.addEventListener('resize', resizeDisplay)

			closeButton.onclick = () => {
				deviceSelection.style.opacity = '0'
				deviceSelection.style.pointerEvents = 'none'
			}
			
			newDeviceList.sort(function(a, b) {
				let translate = (d) => {
					if (d.company == 'Brains@Play'){
						return 0 // B@P
					} else if (d.company == 'HEGAlpha'){
						return 1 // HEG
					} else if (d.company == 'Neuroidss'){
						return 2 // FreEEG
					} else if (d.company == 'OpenBCI'){
						return 3 // OpenBCI
					} else if (d.company == 'Neosensory'){
						return 4 // Neosensory
					} else if (d.company == 'InteraXon'){
						return 5 // InteraXon
					} else {
						return 3 // other
					}
				}
				let pos1 = translate(a)
				let pos2 = translate(b)
				return pos1 - pos2;
			});
			
			newDeviceList.forEach((d, i) => {
				if (d.variants == null) d.variants = ['']

				let cleanCompanyString = d.company.replace(/[|&;$%@"<>()+,]/g, "")

				let insertionDiv = deviceGallery.querySelector(`[name="${cleanCompanyString}"]`)
				if (!insertionDiv) {
					insertionDiv = document.createElement('div')
					insertionDiv.classList.add(`brainsatplay-companyCard`)
					insertionDiv.setAttribute("name",cleanCompanyString)
					insertionDiv.insertAdjacentHTML('beforeend', `<h3>${d.company}</h3><div class="devices"></div>`)
					deviceGallery.insertAdjacentElement('beforeend', insertionDiv)	
				}

				let deviceDiv = document.createElement('div')
				deviceDiv.id = `brainsatplay-device-${d.id}`
				deviceDiv.classList.add('brainsatplay-deviceCard')

				let header = document.createElement('h4')
				header.id = `brainsatplay-header-${d.id}`
				header.innerHTML = d.name
				deviceDiv.insertAdjacentElement('beforeend', header)	

				deviceDiv.insertAdjacentHTML('beforeend', `<div class="variants"></div>`)

				let cleanDeviceString = d.name.replace(/[|&;$%@"<>()+,]/g, "").replace(' ','')

				let deviceIndicator = document.createElement('div')
				deviceIndicator.classList.add('indicator')
				deviceDiv.insertAdjacentElement('beforeend', deviceIndicator)

				d.variants.forEach(v => {
					let variantName = ((v != '') ? `${cleanDeviceString}_${v}` : cleanDeviceString)
					let variantTag = ((v != '') ? `${d.id}_${v}` : d.id)
					let variantLabel = ((v != '') ? v : 'Connect')
					let div = document.createElement('div')
					div.id = `brainsatplay-${variantName}`
					div.classList.add('brainsatplay-variantButton')

					// Add label to button
					div.innerHTML = `<p>${variantLabel}</p>`

					let setIndicator = (on=true) => {
						if (on){
							deviceIndicator.classList.add('on')
						} else {
							deviceIndicator.classList.remove('on')
						}
					}

					let updatedOnConnect = (device) => {
						if (onconnect instanceof Function) onconnect(device)
						for (let app in this.info.apps){
							let connectFunc = this.info.apps[app].settings?.connect?.onconnect
							if (connectFunc instanceof Function) connectFunc(device)
						}
						div.querySelector('p').innerHTML = "Disconnect"
						setIndicator(true)
						div.onclick = () => {this.disconnect()}
					}

					let updatedOnDisconnect = (device) => {
						if (ondisconnect instanceof Function) ondisconnect(device)
						for (let app in this.info.apps){
							let connectFunc = this.info.apps[app].settings?.connect?.ondisconnect
							if (connectFunc instanceof Function) connectFunc(device)
						}
						setIndicator(false)
						div.querySelector('p').innerHTML = variantLabel
						div.onclick =  () => {this.connect(variantTag,d.analysis,updatedOnConnect,updatedOnDisconnect)}
					}

					div.onclick = (e) => {this.connect(variantTag,d.analysis,updatedOnConnect,updatedOnDisconnect)}

					deviceDiv.querySelector('.variants').insertAdjacentElement('beforeend', div)	
				})
				insertionDiv.querySelector('.devices').insertAdjacentElement('beforeend', deviceDiv)	
			});

			if (toggleButton == null){
				let toggleButton = document.createElement('div')
				toggleButton.id = 'deviceManagerOpen'
				toggleButton.classList.add('brainsatplay-default-button')
				toggleButton.style = `
					position: absolute; 
					bottom: 25px; 
					left: 25px;
					z-index: 100;
				`
				toggleButton.innerHTML = 'Open Device Manager'
				document.body.insertAdjacentElement('afterbegin',toggleButton)
				toggleButton.onclick = () => {
					this.openDeviceSelectionMenu(deviceFilter)
				}
			}  else {
				toggleButton.onclick = () => {
					this.openDeviceSelectionMenu(deviceFilter)
				}
			}

			// Autoselect the Correct Device (if declared)
			if (autosimulate === true){
				this.autosimulateDevice(autosimulate)
			}
		}
		
		// Add UI and/or autoselect a device
		if (document.getElementById(`${this.id}DeviceSelection`) == null){
			let ui = new DOMFragment(
				template,
				parentNode,
				undefined,
				setup
			)
		} else {
			if (toggleButton) {
				toggleButton.onclick = () => {
					this.openDeviceSelectionMenu(deviceFilter)
				}
			}
			
			if (autosimulate === true){
				this.autosimulateDevice(autosimulate)
			} 
		}
	}

	openDeviceSelectionMenu = (filter) => {
		let deviceSelection = document.getElementById(`${this.id}DeviceSelection`)
		if (deviceSelection){
			deviceSelection.style.opacity = '1'
			deviceSelection.style.pointerEvents = 'auto'

			// Apply Filter to UI
			let newDeviceList = (filter != null) ? deviceList.filter(d => filter.includes(d.name)) : deviceList
			let companies = {}
			deviceList.forEach(d => {
				let deviceContainer = document.getElementById(`brainsatplay-device-${d.id}`)
				if (deviceContainer){
					let cleanCompanyString = d.company.replace(/[|&;$%@"<>()+,]/g, "")
					if (companies[cleanCompanyString] == null) companies[cleanCompanyString] = false
					if (newDeviceList.includes(d)){
						deviceContainer.style.display = ''
						companies[cleanCompanyString] = true
					} else {
						deviceContainer.style.display = 'none'
					}
				}
			})

			for (let c in companies){
				let div = document.body.querySelector(`[name="${c}"]`)
				if (div){
					if (companies[c]) div.style.display = ''
					else div.style.display = 'none'
				}
			}

		}
	}

	autosimulateDevice = () => {
		// let cleanDeviceString = autoselect.device.replace(/[|&;$%@"<>()+,]/g, "").replace(' ','')
		// let variantName = ((autoselect.variant && autoselect.variant != '') ? `${cleanDeviceString}_${autoselect.variant}` : cleanDeviceString)
		// document.getElementById(`brainsatplay-${variantName}`).click()
		document.getElementById(`brainsatplay-Synthetic`).click()
	}

	beginStream(streamParams = undefined) { //can push app stream parameters here
		if (!this.streamObj.info.streaming) {
			if (streamParams) this.addStreamParams(streamParams);
			this.streamObj.info.streaming = true;
			this.streamObj.streamLoop();
		}
	}

	endStream() {
		this.streamObj.info.streaming = false;
	}

	//get the device stream object
	getDevice(deviceNameOrType = 'FreeEEG32_2', deviceIdx = 0) {
		let found = undefined;
		this.deviceStreams.find((d, i) => {
			if (d.info.deviceName.indexOf(deviceNameOrType) > -1 && d.info.deviceNum === deviceIdx) {
				found = d;
				return true;
			}
			else if (d.info.deviceType.indexOf(deviceNameOrType) > -1 && d.info.deviceNum === deviceIdx) {
				found = d;
				return true;
			}
		});
		return found;
	}

	stopAnalysis(arr=[]) { //eegfft,eegcoherence,bcijs_bandpower,bcijs_pca,heg_pulse
		if (!Array.isArray(arr) && !(arr instanceof Set)) arr = [arr]
		this.deviceStreams.forEach(stream => {
			let atlas = stream.device.atlas
			if (arr.length > 0){
				arr.forEach(name => {
					if (name !== '' && typeof name === 'string') atlas.settings.analysis[name] = false
				})
			} else {
				for (let k in this.atlas.settings.analysis){
					atlas.settings.analysis[k] = false
				}
			}
		})

		if (this.deviceStreams.length == 0 ){
			for (let k in this.atlas.settings.analysis){
				this.atlas.settings.analysis[k] = false
			}
		}
	}

	startAnalysis(arr = []) { //eegfft,eegcoherence,bcijs_bandpower,bcijs_pca,heg_pulse
		if (!Array.isArray(arr) && !(arr instanceof Set)) arr = [arr]
		this.deviceStreams.forEach(stream => {
			let atlas = stream.device.atlas
			arr.forEach(name => {
				if (name !== '' && typeof name === 'string') atlas.settings.analysis[name] = true
			})
		})

	}

	

	//get data for a particular device	
	getDeviceData = (deviceType = 'eeg', tag = 'all', deviceIdx = 0) => { //get device data. Just leave deviceIdx blank unless you have multiple of the same device type connected
		this.deviceStreams.forEach((d, i) => {
			if (d.info.deviceType.indexOf(deviceType) > -1 && d.info.deviceNum === deviceIdx) {
				if (tag === 'all') {
					return d.atlas.data[deviceType]; //Return all objects
				}
				return d.atlas.getDeviceDataByTag(deviceType, tag);
			}
		});
	}

	//listen for changes to atlas data properties
	subscribeToDevices = (type, callback) => {

		let subscribedTags = {}
		let subscribedPointers = {}
		
        let added = (k) => {
            checkIfDevice([k])
        }

        let removed = (k) => {
			let tag = subscribedTags[k]
            if (tag){
				this.state[subscribedPointers[tag].method](tag, subscribedPointers[tag].idx)
				delete subscribedPointers[tag]
				delete subscribedTags[k]
            }
        }

        subscribedPointers['stateAdded'] = {}
		subscribedPointers['stateAdded'].idx = this.state.subscribeSequential('stateAdded', added)
		subscribedPointers['stateAdded'].method = 'unsubscribeSequential' 

		subscribedPointers['stateRemoved'] = {}
        subscribedPointers['stateRemoved'].idx = this.state.subscribeSequential('stateRemoved', removed)
		subscribedPointers['stateRemoved'].method = 'unsubscribeSequential' 

		let checkIfDevice = (arr) => {
			arr.forEach(k => {
				let pass = /^device[.+]*/.test(k)
				if (pass){
					if (this.state.data[k].deviceType === type || type === undefined){
						this.atlas.data.eegshared.eegChannelTags.map(o => o.tag)

						let firstTag = (type === 'eeg') ? this.state.data[k].eegChannelTags[0].tag : 0
						subscribedTags[k] = `${type}_${firstTag}`

						subscribedPointers[`${type}_${firstTag}`] = {method: 'unsubscribe'}
						subscribedPointers[`${type}_${firstTag}`].idx = this.subscribe(type, firstTag, undefined, (data)=>{
							callback(data)
						})
					}
				}
			})
		}

		checkIfDevice(Object.keys(this.state.data)) // Pass Existing States on Init

		return subscribedPointers
	}



	subscribe = (deviceTypeNameOrIdx = 'eeg', tag = 'FP1', prop = null, onData = (newData) => { }, stateManager = this.state) => {
		let sub = undefined;
		let atlasTag = tag;
		let atlasDataProp = null;

		let found = this.deviceStreams.find((o, i) => {
			if(deviceTypeNameOrIdx === i) {
				return true;
			} else if (deviceTypeNameOrIdx === o.info.deviceName) {
				return true;
			} else if (o.info.deviceType.indexOf(deviceTypeNameOrIdx) > -1 && o.info.useAtlas === true) {
				return true;
			}
		});
		if(found) {
			atlasDataProp = found.info.deviceType;
			if (atlasTag === 'shared') { 
				atlasTag = atlasDataProp+'shared';
			}
			let coord = undefined;
				if (atlasTag === 'string' && atlasTag.indexOf('shared') > -1) coord = found.device.atlas.getDeviceDataByTag(atlasTag, null);
				else if (atlasTag === null || atlasTag === 'all') { coord = found.device.atlas.data[atlasDataProp]; } //Subscribe to entire data object 
				else coord = found.device.atlas.getDeviceDataByTag(atlasDataProp, atlasTag);
				if (coord !== undefined) {
					if (prop === null || Array.isArray(coord) || typeof coord[prop] !== 'object') {
						sub = stateManager.addToState(found.info.deviceType + '_' + atlasTag, coord, onData);
					} else if (typeof coord[prop] === 'object') {  //only works for objects which are stored by reference only (i.e. arrays or the means/slices/etc objects, so sub to the whole tag to follow the count)
						sub = stateManager.addToState(atlasTag + "_" + prop, coord[prop], onData);
					}
				}
		}

		return sub;
	}

	//remove the specified onchange function via the sub index returned from subscribe()
	unsubscribe = (tag = 'FP1', sub) => {
		this.state.unsubscribe(tag, sub);
	}

	//this will remove the event listener if you don't have any logic associated with the tag (for performance)
	unsubscribeAll = (tag = 'FP1') => {
		this.state.unsubscribeAll(tag);
	}

	addAnalysisMode(mode = '', deviceName = this.state.data.device0.deviceName, n = 0) {
		let device = this.getDevice(deviceName, n);
		device.info.analysis[mode] = true
		if (!device.atlas.settings.analyzing) {
			device.atlas.settings.analyzing = true;
			device.atlas.analyzer();
		}
	}

	//Add functions to run custom data analysis loops. You can then add functions to gather this data for streaming.
	addAnalyzerFunc(prop = null, callback = () => { }) {
		this.deviceStreams.forEach((o, i) => {
			if (o.device.atlas !== null && prop !== null) {
				if (o.device.atlas.analyzerOpts.indexOf(prop) < 0) {
					o.device.atlas.analyzerOpts.push(prop)
					o.device.atlas.analyzerFuncs.push(callback);
				}
				else {
					console.error("property " + prop + " exists");
				}
			}
		})
	}

	//Input an object that will be updated with app data along with the device stream.
	streamAppData(propname = 'data', props = {}, sessionId=undefined, onData = (newData) => { }) {

		let id = `${propname}`//${Math.floor(Math.random()*100000000)}`;

		this.state.addToState(id, props, onData);

		this.state.data[id + "_flag"] = true;
		
		let sub = this.state.subscribe(id, (newData) => {
			this.state.data[id + "_flag"] = true;
			if(sessionId) {
				if(!this.state.data[sessionId]) this.state.data[sessionId] = {id:sessionId, userData:{id:this.info.auth.id}};
				if (this.state.data[sessionId].userData){
					let o = this.state.data[sessionId].userData
					if(o.id === this.info.auth.id) {
						o[id] = newData; 
						return true;
					} else this.state.data[sessionId].userData.push({id:this.info.auth.id, [id]:newData});
				}
			}
		});

		let newStreamFunc = () => {
			if (this.state.data[id + "_flag"] === true) {
				this.state.data[id + "_flag"] = false;
				return this.state.data[id];
			}
			else return undefined;
		}

		this.addStreamFunc(id, newStreamFunc);

		return id, sub; //this.state.unsubscribeAll(id) when done

	}

	//Remove arbitrary data streams made with streamAppData
	removeStreaming(id, responseIdx, manager = this.state, sequential=false) {
		if (responseIdx == null){
			manager.removeState(id, sequential)
			manager.removeState(id+"_flag", sequential)
			this.streamObj.removeStreamFunc(id); //remove streaming function by name
			let idx = this.streamObj.info.appStreamParams.findIndex((v,i) => v.join('_') === id)
			if (idx != null) this.streamObj.info.appStreamParams.splice(idx,1)
		} else {
			if (sequential) {
				manager.unsubscribeSequential(id, responseIdx); //unsub state
			}
			else manager.unsubscribe(id, responseIdx); //unsub state
		}
	} 

	//Add functions for gathering data to send to the server
	addStreamFunc(name, callback, manager=this.state) {

		if (typeof name === 'string' && typeof callback === 'function') {

			// Artificially add to state (for streaming functions)
			let _callback = () => { 
				let data = callback()
				if (data != undefined) manager.data[name] = data
				return data
			}

			// Run so that solo users get their own data back
			this.streamObj.streamLoop();

			this.streamObj.addStreamFunc(name, _callback);

			if (manager === this.state){
				this.addStreamParams([[name]]);
			} else {
				this.addStreamParams([[name, undefined, 'ignore']]);
			}

		} else { console.error("addStreamFunc error"); }
	}

	//add a parameter to the stream based on available callbacks [['function','arg1','arg2',etc][stream function 2...]]
	addStreamParams(params = []) {
		params.forEach((p, i) => {
			if (Array.isArray(p)) {
				let found = this.deviceStreams.find((d) => {
					if (p[0].indexOf(d.info.deviceType) > -1) {
						if (d.info.deviceType === 'eeg') {
							d.atlas.data.eegshared.eegChannelTags.find((o) => {
								if (o.tag === p[1] || o.ch === p[1]) {
									this.streamObj.info.deviceStreamParams.push(p);
									return true;
								}
							})
						}
						else {
							this.streamObj.info.deviceStreamParams.push(p);
						}

						return true;
					}
				});
				if (!found) this.streamObj.info.appStreamParams.push(p);
			}
		});
	}

	getApp = () => {
		return Realm.App.getApp("brainsatplay-tvmdj")
	}

	loginWithGoogle = async () => {
		return await LoginWithGoogle()
	}

	loginWithRealm = async (authResponse) => {
		let user = await LoginWithRealm(authResponse)
		this.info.googleAuth = user
		return user
	}

	 getLocalIP = async () => {
		return new Promise(resolve => {

		var RTCPeerConnection = /*window.RTCPeerConnection ||*/ window.webkitRTCPeerConnection || window.mozRTCPeerConnection;  
if (RTCPeerConnection)(() => {  
    var rtc = new RTCPeerConnection({  
        iceServers: []  
    });  
    if (1 || window.mozRTCPeerConnection) {  
        rtc.createDataChannel('', {  
            reliable: false  
        });  
    };  
    rtc.onicecandidate = (evt) => {  
		if (evt.candidate) {
			let res = grepSDP("a=" + evt.candidate.candidate);  
			resolve(res)
		}
    };  
    rtc.createOffer(function(offerDesc) {  
        let res = grepSDP(offerDesc.sdp);  
		rtc.setLocalDescription(offerDesc);  
    }, function(e) {  
        console.warn("offer failed", e);  
    });  
    var addrs = Object.create(null);  
    addrs["0.0.0.0"] = false;  
  
    function updateDisplay(newAddr) {  
        if (newAddr in addrs) return;  
        else addrs[newAddr] = true;  
        var displayAddrs = Object.keys(addrs).filter(function(k) {  
            return addrs[k];  
		});
		return displayAddrs
    }  
  
    function grepSDP(sdp) {  
		var hosts = [];  
		let urlArray
        sdp.split('\r\n').forEach(function(line) {  
            if (~line.indexOf("a=candidate")) {  
                var parts = line.split(' '),  
                    addr = parts[4],  
                    type = parts[7];  
                if (type === 'host') urlArray = updateDisplay(addr);  
            } else if (~line.indexOf("c=")) {  
                var parts = line.split(' '),  
                    addr = parts[2];  
					urlArray = updateDisplay(addr);  
            }  
		});  
		
		return urlArray
    }  
})();  
else {  
    console.log('not able to get your local IP address')
}
		})
	}



	//Server login and socket initialization
	async login(beginStream = false, dict = this.info.auth, onsuccess = (newResult) => { }) {

		//Connect to websocket
		if (this.socket == null || this.socket.readyState !== 1) {
			this.socket = this.setupWebSocket(dict).then(socket => {
				this.socket = socket
				this.info.auth.connected = true;
				if (this.socket !== null && this.socket.readyState === 1) {
					if (beginStream === true) {
						this.beginStream();
					}
				}
				let sub = this.state.subscribe('commandResult', (newResult) => {
					if (typeof newResult === 'object') {
						if (newResult.msg === 'resetUsername') {
							this.info.auth.username = newResult.username
							this.info.auth.id = newResult.id
							this.state.unsubscribe('commandResult', sub);
							onsuccess(newResult)
						}
					}
				});
			});
		} else {
			onsuccess()
			return this.info.auth
		}
	}

	async signup(dict = {}, baseURL = this.info.auth.url.toString()) {
		baseURL = this.checkURL(baseURL);
		let json = JSON.stringify(dict);
		let response = await fetch(baseURL.toString() + 'signup',
			{
				method: 'POST',
				mode: 'cors',
				headers: new Headers({
					'Accept': 'application/json',
					'Content-Type': 'application/json'
				}),
				body: json
			}).then((res) => {
				return res.json().then((message) => message);
			})
			.then((message) => {
				console.log(`\n` + message);
				return message;
			})
			.catch(function (err) {
				console.error(`\n` + err.message);
			});

		return response;
	}

	async request(body, method = "POST", pathname = '', baseURL = this.info.auth.url.toString()) {
		if (pathname !== '') {
			baseURL = this.checkURL(baseURL);
			pathname = this.checkPathname(pathname);
			let dict = {
				method: method,
				mode: 'cors',
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json'
				},
			};

			if (method === 'POST') {
				dict.body = JSON.stringify(body);
			}

			return await fetch(baseURL + pathname, dict).then((res) => {
				return res.json().then((dict) => {
					return dict.message;
				})
			})
				.catch(function (err) {
					console.error(`\n` + err.message);
				});
		} else {
			console.error(`You must provide a valid pathname to request resources from ` + baseURL);
			return;
		}
	}

	processSocketMessage(received = '') {
		let parsed = JSON.parse(received);
		if (!parsed.msg) {
			console.log(received);
			return;
		}

		if (parsed.msg === 'userData') {
			for (const prop in parsed.userData) {
				this.state.updateState("userData_" + parsed.id + "_" + prop, parsed.userData[prop])
			}
		}
		else if (parsed.msg === 'sessionData' || parsed.msg === 'getSessionDataResult') {

			let thisuser = this.state.data[parsed.id]?.userData?.find((o) => {if (o.id === this.info.auth.id) return true;});
			let settings = this.state.data[parsed.id]?.settings;
			this.state.data[parsed.id] = parsed;
			if(thisuser) this.state.data[parsed.id].userData.push(thisuser);
			if(settings) this.state.data[parsed.id].settings = settings;

			parsed.userData.forEach((o, i) => {
				let user = o.id
				if (user != this.info.auth.id){
					for (const prop in o) {
						if (prop !== 'username' && prop !== 'id') this.state.updateState(`${parsed.id}_${user}_${prop}`,o[prop])
					}
				}
			});


			if (parsed.userLeft) {
				for (const prop in this.state.data) {
					if (prop.indexOf(parsed.userLeft) > -1) {
						this.state.removeState(prop)
					}
				}
			}
			this.state.updateState(`commandResult`,parsed)
		}
		else if (parsed.msg === 'getUsersResult') {
			this.state.updateState(`commandResult`,parsed)
		}
		else if (parsed.msg === 'getSessionInfoResult') {
			this.state.data.sessionInfo = parsed.sessionInfo;
			if(this.state.data[parsed.session] && parsed.sessionInfo.settings) this.state.data[parsed.id].settings = parsed.sessionInfo.settings;
			this.state.updateState(`commandResult`,parsed);
		}
		else if (parsed.msg === 'getSessionsResult') {
			this.state.updateState(`commandResult`,parsed)
		}
		else if (parsed.msg === 'sessionCreated') {
			this.state.updateState(`commandResult`,parsed)
		}
		else if (parsed.msg === 'subscribedToUser') {
			this.state.updateState(`commandResult`,parsed)
		}
		else if (parsed.msg === 'userNotFound') {
			this.state.updateState(`commandResult`,parsed)
		}
		else if (parsed.msg === 'userSubscriptionInfo') {
			this.state.updateState(`commandResult`,parsed)
		}
		else if (parsed.msg === 'subscribedToSession') {
			this.state.updateState(`commandResult`,parsed)
		}
		else if (parsed.msg === 'leftSession') {
			this.state.updateState(`commandResult`,parsed)
		}
		else if (parsed.msg === 'sessionDeleted') {
			this.state.updateState(`commandResult`,parsed)
		}
		else if (parsed.msg === 'unsubscribed') {
			this.state.updateState(`commandResult`,parsed)
		}
		else if (parsed.msg === 'appNotFound' || parsed.msg === 'sessionNotFound') {
			this.state.updateState(`commandResult`,parsed)
		} else if (parsed.msg === 'resetUsername') {
			this.state.updateState(`commandResult`,parsed)
		} else if (parsed.msg === 'getUserDataResult') {
			this.state.updateState(`commandResult`,parsed)
		} 
		// OSC
		else if (parsed.msg === 'oscError') {
			this.state.updateState(`commandResult`,parsed)
		} else if (parsed.msg === 'oscInfo') {
			this.state.updateState(`commandResult`,parsed)
		} else if (parsed.msg === 'oscData') {
			console.log(parsed.oscData)
			// for (const prop in parsed.userData) {
			// 	this.state.data["userData_" + parsed.username + "_" + prop] = parsed.userData[prop];
			// }
		}
		else {
			console.log(parsed);
		}

	}

	async setupWebSocket(auth = this.info.auth) {

		return new Promise(resolve => {

			let encodeForSubprotocol = (info) => {
				return info.replace(' ', '%20')
			}

			let socket = null;
			let subprotocol = [
				'username&' + encodeForSubprotocol(auth.username),
				'password&' + encodeForSubprotocol(auth.password),
				'origin&' + encodeForSubprotocol('brainsatplay.js')
			];

			if (auth.url.protocol === 'http:') {
				socket = new WebSocket(`ws://` + auth.url.host, subprotocol);
			} else if (auth.url.protocol === 'https:') {
				socket = new WebSocket(`wss://` + auth.url.host, subprotocol);
			} else {
				console.log('invalid protocol');
				return;
			}

			socket.onerror = (e) => {
				console.log('error', e);
			};

			socket.onopen = () => {
				this.streamObj.socket = socket;
				resolve(socket);
			};

			socket.onmessage = (msg) => {
				// console.log('Message recieved: ' + msg.data)
				this.processSocketMessage(msg.data);
			}

			socket.onclose = (msg) => {
				this.info.auth.connected = false;
				console.log('close');
			}
		})
	}

	subscribeToUser(id = '', userProps = [], onsuccess = (newResult) => { }) { // if successful, props will be available in state under this.state.data['username_prop']
		//check if user is subscribable
		if (this.socket !== null && this.socket.readyState === 1) {
			this.sendBrainstormCommand(['getUserData', id]);
			userProps.forEach((prop) => {
				let p = prop;
				if (Array.isArray(p)) p = prop.join("_"); //if props are given like ['eegch','FP1']
				this.state.updateState(id + "_" + p, null)
			});
			//wait for result, if user found then add the user
			let sub = this.state.subscribe('commandResult', (newResult) => {
				if (typeof newResult === 'object') {
					if (newResult.msg === 'getUserDataResult') {
						if (newResult.id === id) {
							this.sendBrainstormCommand(['subscribeToUser', id, userProps]);
							for (const [prop, value] of Object.entries(newResult.userData.props)) {
								this.state.updateState("userData_" + id + "_" + prop, value)
							}
						}
						onsuccess(newResult.userData);
						this.state.unsubscribe('commandResult', sub);
					}
					else if (newResult.msg === 'userNotFound' && newResult.id === id) {
						this.state.unsubscribe('commandResult', sub);
						console.log("User not found: ", id);
					}
				}
			});
		}
	}

	unsubscribeFromUser(id = '', userProps = null, onsuccess = (newResult) => { }) { //unsubscribe from user entirely or just from specific props
		//send unsubscribe command
		if (this.socket !== null && this.socket.readyState === 1) {
			this.sendBrainstormCommand(['unsubscribeFromUser', id, userProps]);

			let sub = this.state.subscribe('commandResult', (newResult) => {
				if (newResult.msg === 'unsubscribed' && newResult.id === id) {
					for (const prop in this.state.data) {
						if (prop.indexOf(id) > -1) {
							this.state.removeState(prop)
						}
					}
					onsuccess(newResult);
					this.state.unsubscribe('commandResult', sub);
				}
			});
		}
	}

	getUsers(appname, onsuccess = (newResult) => { }) {
		if (this.socket !== null && this.socket.readyState === 1) {
			this.sendBrainstormCommand(['getUsers', appname]);
			//wait for response, check result, if session is found and correct props are available, then add the stream props locally necessary for session
			let sub = this.state.subscribe('commandResult', (newResult) => {
				if (typeof newResult === 'object') {
					if (newResult.msg === 'getUsersResult') {// && newResult.appname === appname) {						
						onsuccess(newResult.userData); //list userData, then subscribe to session by id
						this.state.unsubscribe('commandResult', sub);
						return newResult.userData
					}
				}
				else if (newResult.msg === 'usersNotFound') {//} & newResult.appname === appname) {
					this.state.unsubscribe('commandResult', sub);
					console.log("Users not found: ", appname);
					return []
				}
			});
		}
	}

	startOSC(localAddress="127.0.0.1",localPort=57121, remoteAddress=null, remotePort=null, onsuccess = (newResult) => { }){
		
		// Read and Write to the Same Address if Unspecified
		if (remoteAddress == null) remoteAddress = localAddress
		if (remotePort == null) remotePort = localPort

		this.sendBrainstormCommand(['startOSC', localAddress, localPort, remoteAddress, remotePort]);
		let sub = this.state.subscribe('commandResult', (newResult) => {
			if (typeof newResult === 'object') {
				if (newResult.msg === 'oscInfo') {	
					onsuccess(newResult.oscInfo);
					this.state.unsubscribe('commandResult', sub);
					return newResult.oscInfo
				}
			}
			else if (newResult.msg === 'oscError') {
				this.state.unsubscribe('commandResult', sub);
				console.log("OSC Error", newResult.oscError);
				return []
			}
		});
	}

	// stopOSC(localAddress="127.0.0.1",localPort=57121, onsuccess = (newResult) => { }){

	// }



	getSessions(appname, onsuccess = (newResult) => { }) {

		if (this.socket !== null && this.socket.readyState === 1) {

			this.sendBrainstormCommand(['getSessions', appname]);
			//wait for response, check result, if session is found and correct props are available, then add the stream props locally necessary for session
			let sub = this.state.subscribe('commandResult', (newResult) => {
				if (typeof newResult === 'object') {
					if (newResult.msg === 'getSessionsResult' && newResult.appname === appname) {
						onsuccess(newResult);
						this.state.unsubscribe('commandResult', sub);
						return newResult.sessions
					}
				}
				else if (newResult.msg === 'appNotFound' & newResult.appname === appname) {
					this.state.unsubscribe('commandResult', sub);
					console.log("App not found: ", appname);
					return []
				}
			});
		}
	}

	//connect using the unique id of the subscription
	subscribeToSession(sessionid, spectating = false, onsuccess = (newResult) => { }) {
		if (this.socket !== null && this.socket.readyState === 1 && !this.info.subscriptions.includes(sessionid)) {
			this.sendBrainstormCommand(['getSessionInfo', sessionid]);
			//wait for response, check result, if session is found and correct props are available, then add the stream props locally necessary for session
			let sub = this.state.subscribe('commandResult', (newResult) => {
				if (typeof newResult === 'object') {
					this.state.unsubscribe('commandResult', sub);
					if (newResult.msg === 'getSessionInfoResult' && newResult.sessionInfo.id === sessionid) {
						let configured = true;
						if (spectating === false) {
							//check that this user has the correct streaming configuration with the correct connected device
							let streamParams = [];
							newResult.sessionInfo.propnames.forEach((prop) => {
								streamParams.push(prop.split("_"));
							});
							configured = this.configureStreamForSession(newResult.sessionInfo.devices, streamParams); //Expected propnames like ['eegch','FP1','eegfft','FP2']
							// this.streamObj
						}

						if (configured === true) {
							this.sendBrainstormCommand(['subscribeToSession', sessionid, spectating]);
							this.state.data[newResult.sessionInfo.id] = newResult.sessionInfo;
							this.info.subscriptions.push(sessionid)
							onsuccess(newResult);
						}
					}
					else if (newResult.msg === 'sessionNotFound' & newResult.id === sessionid) {
						this.state.unsubscribe('commandResult', sub);
						console.log("Session not found: ", sessionid);
					}
				}
			});
		}
	}

	setUserStreamSettings(id,settings) {
		this.sendBrainstormCommand(['setUserStreamSettings',id,settings]);
	}

	setSessionSettings(id,settings) {
		this.sendBrainstormCommand(['setSessionSettings',id,settings]);
	}

	setHostSessionSettings(id,settings) {
		this.sendBrainstormCommand(['setHostSessionSettings',id,settings]);
	}

	unsubscribeFromSession(sessionid = '', onsuccess = (newResult) => { }) {
		//send unsubscribe command
		if (this.socket !== null && this.socket.readyState === 1) {
			this.sendBrainstormCommand(['leaveSession', sessionid]);
			let sub = this.state.subscribe('commandResult', (newResult) => {
				if (newResult.msg === 'leftSession' && newResult.id === sessionid) {
					for (const prop in this.state.data) {
						if (prop.indexOf(sessionid) > -1) {
							this.state.removeState(prop)
							delete this.info.subscriptions[this.info.subscriptions.indexOf(sessionid)];
						}
					}
					onsuccess(newResult);
					this.state.unsubscribe('commandResult', sub);
				}
			});
		}
	}


	// App Management
	initApp(settings, parentNode=document.body, session=this, config=[]){
		return new Application(settings, parentNode, session, config)
	}


	startApp(appId,sessionId){
		this.graph.start(appId, sessionId)
		// Update Routing UI
		this.updateApps(appId)
		return this.info.apps[appId]
	}

	updateApps(appId){
		let analysisSet = new Set()

		// Update Per-App Routes
		for(let id in this.info.apps) {
			if (this.info.apps[id]){
				analysisSet.add(...[...this.info.apps[id].analysis.default,...this.info.apps[id].analysis.dynamic])
				if (appId == null || appId === id) this.updateApp(id)
			}
		}

		this.startAnalysis(analysisSet)
		for (let key in this.atlas.settings.analysis){
			if (!analysisSet.has(key)){
				this.atlas.settings.analysis[key] = false
			}
		}

	}

	updateApp(appId){
		if (this.info.apps[appId]){
			this.deviceStreams.forEach(d => {
				if (d.info.events) {
					d.info.events.addApp(appId, this.info.apps[appId].controls)
					d.info.events.updateRouteDisplay()
				}
			})
		}
	}

	registerApp(app){
		this.info.apps[app.props.id] = this.graph.init(app)
		this.info.apps[app.props.id].settings = app.info
		return this.info.apps[app.props.id]
	}

	removeApp(appId){
		let info = this.graph.remove(appId)
		if (this.info.apps[appId]) {
			this.info.apps[appId].analysis.default = []
			this.updateApps(appId)
			
			// Update Routing UI
			this.deviceStreams.forEach(d => {
				if (d.info.events) {
					d.info.events.removeApp(appId)
					d.info.events.updateRouteDisplay()
				}
			})

			if (this.info.apps[appId].editor) this.info.apps[appId].editor.deinit()
			delete this.info.apps[appId]
		}

		return info
	}


	promptLogin = async (parentNode = document.body, oninit=() => {}, onsuccess = () => { }) => {		
		return new Promise((resolve, reject) => {
			let template = () => {
				return `
		<div id="${this.id}login-page" class="brainsatplay-default-container" style="z-index: 1000; opacity: 0; transition: opacity 1s;">
			<div>
				<h2 style="margin-bottom: 10px">Connect to Server</h2>
				<p id="${this.id}urlToConnect" style="font-size: 70%;">${this.info.auth.url}</p>
				<div id="${this.id}login-container" class="brainsatplay-form-container">
					<div id="${this.id}login" class="brainsatplay-form-context">
						<p id="${this.id}login-message" class="small"></p>
						<div class='flex'>
							<form id="${this.id}login-form" class="brainsatplay-form" action="">
								<div class="brainsatplay-login-element" style="margin-left: 0px; margin-right: 0px">
									<input type="text" name="username" autocomplete="off" placeholder="Enter a username"/>
								</div>
							</form>
						</div>
						<div class="brainsatplay-login-buttons" style="justify-content: flex-start;">
							<div id="${this.id}login-button" class="brainsatplay-default-button">Sign In</div>
						</div>
					</div>
				</div>
			</div>
		</div>
		`}

			let setup = () => {
				let loginPage = document.getElementById(`${this.id}login-page`)
				const loginButton = loginPage.querySelector(`[id='${this.id}login-button']`)
				let form = loginPage.querySelector(`[id='${this.id}login-form']`)
				const usernameInput = form.querySelector('input')

				oninit()

				// Update the Auth URL
				let onClick = () => {
					let urlInput = document.getElementById(`${this.id}urlToConnect`)
					let input = document.createElement('input')
					input.id = `${this.id}urlToConnect`
					input.type = 'text'
					input.value = urlInput.innerHTML
					input.style.fontSize = '70%'
					input.style.background = 'transparent';
					input.style.color = 'white';
					input.style.padding = '5px';
					input.style.border = 'none'
					input.style.borderBottom = '1px solid white'
					urlInput.parentNode.replaceChild(input, urlInput);
					setTimeout(() => {document.addEventListener("click", clickOutside)}, 1000)
				}

				let inputToParagraph = (urlInput) => {
					if (urlInput.tagName !== 'P'){
						let paragraph = document.createElement('p')
						paragraph.id = `${this.id}urlToConnect`
						paragraph.style.fontSize = '80%'
						paragraph.innerHTML = urlInput.value
						paragraph.onclick = onClick
						urlInput.parentNode.replaceChild(paragraph, urlInput);
						document.removeEventListener("click", clickOutside)
						return paragraph
					} else {
						return urlInput
					}
				}

				let clickOutside = (evt) => {
					let urlInput = document.getElementById(`${this.id}urlToConnect`)
					let targetElement = evt.target; // clicked element
				
					do {
						if (targetElement == urlInput) {
							return;
						}
						targetElement = targetElement.parentNode;
					} while (targetElement);
				
					// This is a click outside.
					if (urlInput != null){
						inputToParagraph(urlInput)
					}
				};

				document.getElementById(`${this.id}urlToConnect`).onclick = onClick

				form.addEventListener("keyup", function (event) {
					if (event.keyCode === 13) {
						event.preventDefault();
					}
				});

				usernameInput.addEventListener("keyup", function (event) {
					if (event.keyCode === 13) {
						event.preventDefault();
						loginButton.click();
					}
				});

				loginButton.onclick = () => {
					
					let urlEl = document.getElementById(`${this.id}urlToConnect`)
					urlEl = inputToParagraph(urlEl)

					try {
						let specifiedURL = new URL(urlEl.innerHTML)
						if (specifiedURL){
							this.info.auth.url = specifiedURL
							let formDict = {}
							let formData = new FormData(form);
							for (var pair of formData.entries()) {
								formDict[pair[0]] = pair[1];
							}

							this.setLoginInfo(formDict.username)


							this.login(true, this.info.auth, () => {
								onsuccess()
								resolve(true);
								setTimeout(() => {ui.deleteNode()},1000)
							})
						}
					} catch (error) {
						console.log(error)
					}
				}

				// Auto-set username with Google Login
				// if (this.info.googleAuth != null) {
				// 	this.info.googleAuth.refreshCustomData().then(data => {
				// 		loginPage.querySelector(`[name="username"]`).value = data.username
				// 		loginButton.click()
				// 	})
				// }

				loginPage.style.transition = 'opacity 1s'
				loginPage.style.opacity = '1'
			}

			let ui = new DOMFragment(
				template,
				parentNode,
				undefined,
				setup
			)
		});
	}

	createBrainstormBrowser = (parentNode = document.body, onsubscribe = () => { }) => {

		let t = 1
		
		let template = () => {
			return `
			<div id="${this.id}-brainstormBrowser" style="z-index: 1000; background: black; width:100%; height: 100%; position: absolute; top: 0; left: 0; display:flex; align-items: center; justify-content: center; opacity: 0;">
				<div id="${this.id}-choiceDisplay" style="flex-grow: 1;">
					<h1>Browse the Brainstorm</h1>
					<div style="display: flex;">
						<div id="${this.id}-userDiv" style="flex-grow: 1; overflow-y: scroll; border: 1px solid white;">
						
						</div>
						<div id="${this.id}-controlsDiv" style="overflow-y: scroll; width: 200px; display: flex; flex-wrap: wrap; justify-content: center;">
							<button name="users" class="brainsatplay-default-button" style="margin: 12.5px 25px;">WebSocket</button>
							<button name="osc" class="brainsatplay-default-button" style="margin: 12.5px 25px;">OSC</button>
						</div>
					</div>
				</div>
				<button id="${this.id}-exitBrowser" class="brainsatplay-default-button" style="position: absolute; bottom:25px; right: 25px;">Go Back</button>
			</div>`
		}

		let setup = () => {
			let browser = document.getElementById(`${this.id}-brainstormBrowser`)
			let userDiv = browser.querySelector(`[id='${this.id}-userDiv']`)
			let controlsDiv = browser.querySelector(`[id='${this.id}-controlsDiv']`)
			let wsButton = controlsDiv.querySelector(`[name='users']`)
			let oscButton = controlsDiv.querySelector(`[name='osc']`)
			let lslButton = controlsDiv.querySelector(`[name='lsl']`)

			let closeUI = () => {
				browser.style.opacity = '0'
				window.removeEventListener('resize', resizeDisplay)
				setTimeout(() => {ui.deleteNode()},t*1000)
			}


			const resizeDisplay = () => {
				let browser = document.getElementById(`${this.id}-brainstormBrowser`)
				let display = browser.querySelector(`[id='${this.id}-choiceDisplay']`)
				let userDiv = browser.querySelector(`[id='${this.id}-userDiv']`)
				let padding = 50;
				browser.style.padding = `${padding}px`
				userDiv.style.height = `${window.innerHeight - 2 * padding - (display.offsetHeight - userDiv.offsetHeight)}px`
			}

			let exitBrowser = browser.querySelector(`[id='${this.id}-exitBrowser']`)
			exitBrowser.onclick = closeUI

			resizeDisplay()
			window.addEventListener('resize', resizeDisplay)
			browser.style.transition = `opacity ${t}s`
			browser.style.opacity = '1'

			let updateUserDisplay = (mode, users) => {
				userDiv.innerHTML = ''

				let brainstormUserStyle = `
				background: rgb(20,20,20);
				padding: 25px;
				border: 1px solid black;
				transition: 0.5s;
			`

				users.forEach(o => {
					let keys = Object.keys(o) //['sessions', 'username', 'origin', 'id']
					let appMessage = ((o[keys[0]] == '') ? 'No App Specified' : `Currently in ${o[keys[0]]}`)
					
					let user = document.createElement('div')
					user.setAttribute('data-id', keys[3])
					user.id = `${this.id}-user-${o[keys[1]]}`
					user.classList.add('brainstorm-user')
					user.style = brainstormUserStyle
					user.insertAdjacentHTML('beforeend', `
					<p style="font-size: 60%;">${o[keys[2]]}</p>
					<p>${o[keys[1]]}</p>
					<p style="font-size: 80%;">${appMessage}</p>`)
					
					if (o[keys[2]] != 'brainsatplay.js') {
						user.onmouseover = () => {
							user.style.background = 'rgb(35,35,35)';
							user.style.cursor = 'pointer';
						}
						user.onmouseout = () => {
							user.style.background = 'rgb(20,20,20)';
							user.style.cursor = 'default';
						}
						user.onclick = (e) => {
							if (mode == 'ws'){
								this.subscribeToUser(o[keys[3]], [], (userData) => {
									onsubscribe(userData)
								})
							} else if (mode == 'osc'){
								this.sendBrainstormCommand(['sendOSC', {test: 'connected'}]);
							}
							closeUI()
						}
						userDiv.insertAdjacentElement('beforeend', user)
					} else {
						userDiv.insertAdjacentElement('afterbegin', user)
						user.style.background = 'rgb(10,10,10)';
					}
				})
			}

			// Display All Users on Brainstorm
			wsButton.addEventListener('click', () => {
				this.getUsers(null, (userData) => {

					updateUserDisplay('ws', userData)
				})
			})

			// Check OSC Port
			oscButton.addEventListener('click', () => {

				this.startOSC(undefined,undefined,undefined,undefined, (oscInfo) => {
					console.log(oscInfo)
					updateUserDisplay('osc',oscInfo)
				})
			})

			wsButton.click()
		}

		let ui = new DOMFragment(
			template,
			parentNode,
			undefined,
			setup
		)
	}


	createIntro = (applet, onsuccess= () => {}) => {
		// Override App Settings with Configuration Settings
		if (applet.info.intro == null){
			onsuccess()
		} else {
		if (applet.info.intro.constructor != Object) applet.info.intro = {}
		if (applet.info.intro != false) {
			if (applet.info.intro.title == null) applet.info.intro.title = true
		}

		applet.settings.forEach((cmd,i) => {
            if(typeof cmd === 'object') {
				if (cmd.title != null) applet.info.intro.title = cmd.title
				if (cmd.login != null) applet.info.intro.login = cmd.login
				if (cmd.domain != null) applet.info.intro.domain = cmd.domain
				if (cmd.mode != null) applet.info.intro.mode = cmd.mode
				if (cmd.session != null) applet.info.intro.session = cmd.session
				if (cmd.exitSession != null) applet.info.intro.exitSession = cmd.exitSession
				if (cmd.spectating != null) applet.info.intro.spectating = cmd.spectating
			}
		})

		let exitSession = applet.info.intro.exitSession
		let showTitle = (applet.info.intro) ? applet.info.intro.title : true

		let template = `
		<div id="${applet.props.id}IntroFragment">
			<div id='${applet.props.id}appHero' class="brainsatplay-default-container" style="z-index: 100;">
				<div>
					<h1>${applet.info.name}</h1>
					<p>${applet.subtitle ?? applet.info.intro.subtitle ?? ''}</p>
					<div class="brainsatplay-intro-loadingbar" style="z-index: 100;"></div>
				</div>
			</div>

			<div id='${applet.props.id}mode-screen' class="brainsatplay-default-container" style="z-index: 99;">
				<div>
					<h2>Game Mode</h2>
					<div style="display: flex; align-items: center;">
							<div id="${applet.props.id}solo-button" class="brainsatplay-default-button">Solo</div>
							<div id="${applet.props.id}multiplayer-button" class="brainsatplay-default-button">Multiplayer</div>
					</div>
				</div>
			</div>

			<div id='${applet.props.id}sessionSelection' class="brainsatplay-default-container" style="z-index: 98;">
				<div>
					<div id='${applet.props.id}multiplayerDiv'">
						<div style="
						display: flex;
						align-items: center;
						column-gap: 15px;
						grid-template-columns: repeat(2,1fr)">
							<h2>Choose a Session</h2>
							<div>
								<button id='${applet.props.id}createSession' class="brainsatplay-default-button" style="flex-grow:0; padding: 10px; width: auto; min-height: auto; font-size: 70%;">Make New Session</button>
							</div>
						</div>
					</div>
				</div>
			</div>
			`

		let setup = () => {

		// Setup HTML References
		let modeScreen = document.getElementById(`${applet.props.id}mode-screen`)
		let sessionSelection = document.getElementById(`${applet.props.id}sessionSelection`)


		if (typeof exitSession === 'string') exitSession = document.getElementById(exitSession)
		if (exitSession == null) {
			exitSession = document.createElement(`div`) // EDIT
			exitSession.classList.add('brainsatplay-default-button')
			exitSession.style = `position: absolute; bottom: 25px; right: 25px; z-index:95;`
			exitSession.innerHTML = 'Exit Session'
			document.getElementById(`${applet.props.id}IntroFragment`).insertAdjacentElement('afterend', exitSession)
		}


		const hero = document.getElementById(`${applet.props.id}appHero`)
		const loadingBarElement = document.querySelector('.brainsatplay-intro-loadingbar')

		// Select Mode
		let solo = modeScreen.querySelector(`[id="${applet.props.id}solo-button"]`)
		let multiplayer = modeScreen.querySelector(`[id="${applet.props.id}multiplayer-button"]`)
		solo.onclick = () => {
			modeScreen.style.opacity = 0
			onsuccess()
			let loginPage = document.getElementById(`${this.id}login-page`)
			if (loginPage != null) loginPage.remove()
			modeScreen.style.pointerEvents = 'none'
			sessionSelection.style.display = 'none'
			exitSession.style.display = 'none'
		}

		if (window.navigator.onLine){
			multiplayer.onclick = () => {
				modeScreen.style.opacity = 0
				modeScreen.style.pointerEvents = 'none'
			}
		} else {
			multiplayer.style.opacity = 0.25
			multiplayer.style.pointerEvents = 'none'
		}
		
		// Create Session Brower
		let baseBrowserId = `${applet.props.id}${applet.info.name}`
		document.getElementById(`${applet.props.id}multiplayerDiv`).insertAdjacentHTML('beforeend', `<button id='${baseBrowserId}search' class="brainsatplay-default-button">Search</button>`)
		document.getElementById(`${applet.props.id}multiplayerDiv`).insertAdjacentHTML('beforeend', `<div id='${baseBrowserId}browserContainer' style="box-sizing: border-box; padding: 10px 0px; overflow-y: hidden; height: 100%; width: 100%;"><div id='${baseBrowserId}browser' style='display: flex; align-items: center; width: 100%; font-size: 80%; overflow-x: scroll; box-sizing: border-box; padding: 25px 5%;'></div></div>`)

		let waitForReturnedMsg = (msgs, callback = () => { }) => {
			if (msgs.includes(this.state.data.commandResult.msg)) {
				callback(this.state.data.commandResult.msg)
			} else {
				setTimeout(() => waitForReturnedMsg(msgs, callback), 250)
			}
		}

		let onjoined = (g) => {
			sessionSelection.style.opacity = 0;
			sessionSelection.style.pointerEvents = 'none'
			onsuccess(g)
		}
		let onleave = () => {
			sessionSearch.click()
			sessionSelection.style.opacity = '1';
			sessionSelection.style.pointerEvents = 'auto'
		}

		let sessionSearch = document.getElementById(`${baseBrowserId}search`)

		
		let connectToGame = (g, spectate) => {

			this.subscribeToSession(g.id, spectate, (subresult) => {
				onjoined(g);

				let leaveSession = () => {
					this.unsubscribeFromSession(g.id, () => {
						onleave(g);
					});
				}

				exitSession.addEventListener('click', leaveSession)
			});
		}


		let autoJoinSession = (applet, autoId) => {
			if (autoId != null){
				let playing = applet.info.intro.spectating != true // Default to player
				if (playing){
					connectToGame(autoId, false)
				} else {
					connectToGame(autoId, true)
				}

				// Clear Auto-Join Parameters
				applet.info.intro.session = false
			}
		}

		let autoId = false

		if (applet.info.intro && applet.info.intro.session){
			sessionSelection.style.opacity = '0'
		}

		sessionSearch.onclick = () => {


			this.getSessions(applet.info.name, (result) => {

				let gridhtml = '';

				if (applet.info.intro && applet.info.intro.session){
					let sessionToJoin = applet.info.intro.session
					if (sessionToJoin == true) autoId = result.sessions[0]
					else if (sessionToJoin == null) autoId = result.sessions[0]
					else autoId = result.sessions.find(g => g.id === sessionToJoin)
				} else {
					autoId = false
				}


				if (!autoId || autoId == null){
					
					result.sessions.forEach((g, i) => {
						let numUsers = Object.keys(g.users).length
						let disabled = ''

						if (numUsers >= 10) disabled = 'disabled' // Limit connections to the same session server
						gridhtml += `<div style="padding-right: 25px;"><h3 style="margin-bottom: 0px;">` + g.id + `</h3><p>Players: ` + numUsers + `</p>
						<div style="display: flex; padding-top: 5px;">
							<button id='` + g.id + `play' style="margin-left: 0px; width: auto" class="brainsatplay-default-button ${disabled}">Play</button>
							<button id='` + g.id + `spectate' style="margin-left: 10px; width: auto" class="brainsatplay-default-button">Spectate</button>
						</div>
						</div>`
					});

					document.getElementById(baseBrowserId + 'browser').innerHTML = gridhtml


				result.sessions.forEach((g) => {
					let playButton = document.getElementById(`${g.id}play`)
					let spectateButton = document.getElementById(`${g.id}spectate`)
					playButton.addEventListener('click', () => { connectToGame(g, false) })
					spectateButton.addEventListener('click', () => { connectToGame(g, true) })
				});
			} else {
				console.log('auto joining again')
				autoJoinSession(applet,autoId)
			}
			});
		}

		// Login Screen
		if (applet.info.intro?.mode != 'single' && applet.info.intro?.mode != 'solo'){
			let onsocketopen = () => {
				if (this.socket.readyState === 1) {
					sessionSearch.click()
					let loginScreen = document.getElementById(`${this.id}login-page`)

					let sub1 = this.state.subscribe('commandResult', (newResult) => {
						if (newResult.msg === 'appNotFound') {
							createSession.click()

							let sub2 = this.state.subscribe('commandResult', (newResult) => {

								if (newResult.msg === 'sessionCreated') {
									sessionSearch.click()
									if (loginScreen){
										loginScreen.style.opacity = 0;
										loginScreen.style.pointerEvents = 'none'
									}
									this.state.unsubscribe('commandResult', sub2);
								}
							})
							this.state.unsubscribe('commandResult', sub1);

						} else if ('getSessionsResult') {
							this.state.unsubscribe('commandResult', sub1);
							if (loginScreen){
								loginScreen.style.opacity = 0;
								loginScreen.style.pointerEvents = 'none'
							}
						}
					})
				} else {
					setTimeout(() => {onsocketopen()}, 500)
				}
			}

			// Auto-set username with Google Login
			if (this.info.googleAuth != null) {
				this.info.googleAuth.refreshCustomData().then(data => {
					this.info.auth.username = data.username
				})
			}

		// Auto-Toggle Title and Mode Selection
		if (applet.info.intro.mode === 'multi' || applet.info.intro.mode === 'multiplayer' || applet.info.intro.mode === 'remote') {
			multiplayer.click()
		}

		// Prompt Login or Skip
		if (applet.info.intro.domain) this.info.auth.url = new URL(applet.info.intro.domain)

		if (applet.info.intro.login === false || this.socket?.readyState == 1){
			this.login(true, this.info.auth, onsocketopen)
		} else {
			this.promptLogin(document.getElementById(`${applet.props.id}IntroFragment`),() => {
				let loginPage = document.getElementById(`${this.id}login-page`)
				loginPage.style.zIndex = 98;
			}, onsocketopen)
		}
	} else {
		solo.click()
	}


		exitSession.onclick = () => {
			sessionSelection.style.opacity = 1;
			sessionSelection.style.pointerEvents = 'auto'
		}

		let createSession = document.getElementById(`${applet.props.id}createSession`)

		createSession.onclick = () => {
			this.sendBrainstormCommand(['createSession', applet.info.name, applet.info.devices, Array.from(applet.graph.streams)]);

			waitForReturnedMsg(['sessionCreated'], () => { sessionSearch.click() })
		}
		// createSession.style.display = 'none'
		sessionSearch.style.display = 'none'

		let loaded = 0
		const loadInc = 5
		const loadTime = 3000

		if (showTitle){
			setTimeout(() => {
				loadingBarElement.style.transition = `transform ${(loadTime - 1000) / 1000}s`;
				loadingBarElement.style.transform = `scaleX(1)`
			}, 1000)
			setTimeout(() => {
				if (loadingBarElement) {
					loadingBarElement.classList.add('ended')
					loadingBarElement.style.transform = ''
				}
				if (hero) {
					hero.style.opacity = 0;
					hero.style.pointerEvents = 'none'
				}
			}, loadTime)
		} else {
			const hero = document.getElementById(`${applet.props.id}appHero`)
			if (hero) {
				hero.style.opacity = 0;
				hero.style.pointerEvents = 'none'
			}
		}
		}

		applet.intro = new DOMFragment(
			template,
			document.getElementById(`${applet.props.id}`),
			undefined,
			setup
		)
		
	}
	}

	kickUserFromSession = (sessionid, userToKick, onsuccess = (newResult) => { }) => {
		if (this.socket !== null && this.socket.readyState === 1) {
			this.sendBrainstormCommand(['leaveSession', sessionid, userToKick]);
			let sub = this.state.subscribe('commandResult', (newResult) => {
				if (newResult.msg === 'leftSession' && newResult.id === sessionid) {
					for (const prop in this.state.data) {
						if (prop.indexOf(userToKick) > -1) {
							this.state.removeState(prop)
						}
					}
					onsuccess(newResult);
					this.state.unsubscribe('commandResult', sub);
				}
			});
		}
	}

	configureStreamForSession(deviceTypes = [], streamParams = []) { //Set local device stream parameters based on what the session wants
		let params = streamParams;
		let d = undefined;
		if (this.deviceStreams.length === 0) { //no devices, add params anyway
			params.forEach((p) => {
				if (!this.streamObj.deviceStreams.find((ds) => { if (p[0].indexOf(ds.info.deviceType) > -1) { return true; } })) {
					if (!this.streamObj.info.appStreamParams.find((sp) => { if (sp.toString() === p.toString()) return true; })) {
						this.streamObj.info.appStreamParams.push(p);
					}
				}
			});
			if (this.streamObj.info.streaming === false) {
				this.streamObj.info.streaming = true;
				this.streamObj.streamLoop();
			}
		} else {

			deviceTypes.forEach((name, i) => { // configure named device
				d = this.deviceStreams.find((o, j) => {
					if (o.info.deviceType.toLowerCase() === name.toLowerCase()) {
						let deviceParams = [];
						params.forEach((p) => {
							if (p[0].indexOf(o.info.deviceType) > -1 && !this.streamObj.info.deviceStreamParams.find(dp => dp.toString() === p.toString())) { //stream parameters should have the device type specified (in case multiple devices are involved)
								if ('eeg' === o.info.deviceType.toLowerCase()) {
									o.device.atlas.data.eegshared.eegChannelTags.find((ob) => {
										if (ob.tag === p[1] || ob.ch === p[1]) {
											deviceParams.push(p);
											return true;
										}
									})
								}
								else deviceParams.push(p);
							}
							else if (!this.streamObj.deviceStreams.find((ds) => { if (p[0].indexOf(ds.info.deviceType) > -1) { return true; } })) {
								if (!this.streamObj.info.appStreamParams.find((sp) => { if (sp.toString() === p.toString()) return true; })) {
									this.streamObj.info.appStreamParams.push(p);
								}
							}
						});
						if (deviceParams.length > 0 || this.streamObj.info.appStreamParams.length > 0) {
							this.streamObj.info.deviceStreamParams.push(...deviceParams);
							if (this.streamObj.info.streaming === false) {
								this.streamObj.info.streaming = true;
								this.streamObj.streamLoop();
							}
							return true;
						}
					}
				});
			});
		}
		if (this.streamObj.info.deviceStreamParams.length === 0 && this.streamObj.info.appStreamParams.length === 0) {
			console.error('Compatible device not found');
			return false;
		}
		else {
			return true;
		}
	}

	async sendBrainstormCommand(command = '', dict = {}) {

		// Create Message
		let o = { cmd: command, id: this.info.auth.id };
		Object.assign(o, dict);
		let json = JSON.stringify(o);


		if (this.socket.readyState !== 1) {
			// Try to Send Message
			try {
				await this.waitForOpenConnection(this.socket)
				this.socket.send(json)
			} catch (err) { console.error(err) }
		} else {
			this.socket.send(json)
		}
	}

	waitForOpenConnection = (socket) => {
		return new Promise((resolve, reject) => {
			const maxNumberOfAttempts = 10;
			const intervalTime = 200; //ms

			let currentAttempt = 0;
			const interval = setInterval(() => {
				if (currentAttempt > maxNumberOfAttempts - 1) {
					clearInterval(interval)
					reject(new Error('Maximum number of attempts exceeded'))
				} else if (socket.readyState === socket.OPEN) {
					clearInterval(interval)
					resolve()
				}
				currentAttempt++
			}, intervalTime)
		})
	}

	closeSocket() {
		this.socket.close();
	}

	onconnectionLost(response) { //If a user is removed from the server
		let found = false; let idx = 0;
		let c = this.info.subscriptions.find((o, i) => {
			if (o.id === response.id) {
				found = true;
				return true;
			}
		});
		if (found === true) {
			this.info.subscriptions.splice(idx, 1);
			this.info.nDevices--;
		}
	}

	checkURL(url) {
		if (url.slice(-1) !== '/') {
			url += '/';
		}
		return url;
	}

	checkPathname(pathname) {
		if (pathname.slice(0) === '/') {
			pathname.splice(0, 1);
		}
		return pathname;
	}

	// Session Data Utilities
	getEEGDataByChannel(ch, data){
		atlas.getEEGDataByChannel()
	}


	getHostData(appid){
		let state = this.state.data[appid];
		if (state.msg === 'sessionData' && state.id === appid){
			if(state.hostData) return {data: state.hostData, id: state.host}
			return {data: state.userData.find((o)=>{if(o.id === state.host) return true;}), id: state.host}
		}
	}

	getBrainstormData(query, props=[], type = 'app', format = 'default') {


		let sessionInd,idInd,propInd,structureFilter

		if (type === 'user') {
			idInd = 1
			propInd = 2
			structureFilter = (input) => {
				let val = input.split('_')[0] 
				return val === 'userData'
			}
		} else {
			sessionInd = 1
			idInd = 2
			propInd = 3
			structureFilter = (input) => {
				return input.split('_')[0] !== 'userData'
			}
		}

		let arr = []

		if (query != null) {
			var regex = new RegExp(query);

			let returnedStates = Object.keys(this.state.data).filter(k => {

				// Query is True
				let test1 = regex.test(k)

				// Structure is Appropriate
				let test2 = structureFilter(k)

				// Props are Included
				let test3 = false;
				props.forEach(p => {
					if (k.includes(p)){
						test3 = true
					}
				})
				
				if (test1 && test2 && test3) return true
			})

			let usedNames = []


			returnedStates.forEach(str => {

				const strArr = str.split('_')
				const id = strArr[idInd]

				let username = (sessionInd) ? this.state.data[`${strArr[0]}_${strArr[1]}`]?.users[id] : null

				if (id != this.info.auth.id){ // Ignore yourself in state
					if (!usedNames.includes(id)) {
						usedNames.push(id)
						arr.push({ id , username})
					}

					arr.find(o => {
						let prop = strArr.slice(propInd).join('_') // Other User Data
						if (o.id === id) {

							// Plugin Format
							if (format === 'plugin'){
								if (Array.isArray(this.state.data[str])){
									o.data = this.state.data[str][0].data
									o.meta = this.state.data[str][0].meta
								} else {
									let u = arr.splice(arr.length - 1,1)
								}
							} 
							
							// Default Format
							else {
								o[prop] = this.state.data[str]
							}
						}
					})
				}
			})

			let i = arr.length
			arr.push({ id: this.info.auth.id})
			props.forEach(prop => {

				// Plugin Format
				if (format === 'plugin'){
					if (Array.isArray(this.state.data[prop])){
						arr[i].data = this.state.data[prop][0].data
						arr[i].meta = this.state.data[prop][0].meta
					} else {
						let u = arr.splice(arr.length - 1,1)
						console.error('Misformatted data for user ' + u.id, 'me')
					}
				} 
				
				// Default Format
				else {
					arr[i][prop] = this.state.data[prop]
				}
			})
		} else {
			console.error('please specify a query for the Brainstorm (app, username, prop)')
		}

		// console.log(arr)

		return arr
	}

	initFS = (oninit=()=>{console.log("BrowserFS ready!");this.dataManager.setupAutosaving();},onerror=()=>{}) => {
		this.session.dataManager.initFS(oninit,onerror);
	}

}

//-------------------------------------------------------------------------------------------------------
//-------------------------------------------------------------------------------------------------------
//-------------------------------------------------------------------------------------------------------

//Class for handling local device streaming as well as automating data organization/analysis and streaming to server.
class deviceStream {
	constructor(
		device = "freeeeg32_2",
		analysis = ['eegfft'],
		useFilters = true,
		pipeToAtlas = true,
		auth = {
			username: 'guest'
		},
		session = null
	) {
		this.info = {
			deviceName: device,
			deviceType: null,
			analysis: analysis, //['eegcoherence','eegfft' etc]
			session: session,
			events: new EventRouter(),

			deviceNum: 0,

			googleAuth: null,
			auth: auth,
			sps: null,
			useFilters: useFilters,
			useAtlas: false,
			simulating: false,
			randomId: 'deviceStream_'+Math.floor(Math.random()*1000000000)
		};

		this.device = null, //Device object, can be instance of our device plugin classes.
		this.atlas = null,
		this.deviceConfigs = deviceList,
		this.pipeToAtlas = pipeToAtlas;
		//this.init(device,useFilters,pipeToAtlas,analysis);
	}

	init = async (info = this.info, pipeToAtlas = this.pipeToAtlas) => {

		return new Promise(async (resolve, reject) => {
			async function findAsync(arr, asyncCallback) {
				const promises = arr.map(asyncCallback);
				const results = await Promise.all(promises);
				const index = results.findIndex(result => result);
				return arr[index];
			}

			findAsync(this.deviceConfigs, async (o, i) => {

				if (info.deviceName.indexOf(o.id) > -1) {
					if (info.deviceName.includes('brainstorm')) {
						this.device = new o.cls(info.deviceName, info.session, this.onconnect, this.ondisconnect);
					} else {
						this.device = new o.cls(info.deviceName, this.onconnect, this.ondisconnect);
					}

					// Initialize Device
					await this.device.init(info, pipeToAtlas);
					resolve(true);
					return true;
				}
			});
		})
	}

	connect = async () => {
		await this.device.connect();
		this.info.events.init(this.device);
		this.atlas = this.device.atlas;
		return true;
	}

	configureRoutes = (parentNode=document.body) => {
		this.info.events.addControls(parentNode);
		this.info.events.addDebugger(parentNode);
    }

	disconnect = () => {
		this.info.events.deinit()
		this.device.disconnect();
	}

	//Generic handlers to be called by devices, you can stage further processing and UI/State handling here
	onconnect() { }

	ondisconnect() { }

}



class streamSession {
	constructor(info, socket) {

		this.deviceStreams = [];

		this.info = {
			auth: info.auth,
			subscriptions: info.subscriptions,
			streaming: false,
			deviceStreamParams: [],
			nDevices: 0,
			appStreamParams: [],
			streamCt: 0,
			streamLoopTiming: 50
		};

		this.streamTable = []; //tags and callbacks for streaming
		this.socket = socket;

		this.configureDefaultStreamTable();
	}

	configureDefaultStreamTable(params = []) {
		//Stream table default parameter callbacks to extract desired data from the data atlas
		let getEEGChData = (device, channel, nSamples = 'all') => {
			let get = nSamples;
			if (device?.info?.useAtlas === true) {
				let coord = false;
				if (typeof channel === 'number') {
					coord = device.atlas.getEEGDataByChannel(channel);
				}
				else {
					coord = device.atlas.getEEGDataByTag(channel);
				}
				if (coord !== undefined) {
					if (get === 'all') {
						if (coord.count === 0) return undefined;
						get = coord.count - coord.lastRead;
						coord.lastRead = coord.count; //tracks count of last reading for keeping up to date
						if (get === 0) return undefined;
					}
					if (coord.filtered.length > 0) {
						let times = coord.times.slice(coord.times.length - get, coord.times.length);
						let samples = coord.filtered.slice(coord.filtered.length - get, coord.filtered.length);
						return { times: times, samples: samples };
					}
					else if (coord.raw.length > 0) {
						let times = coord.times.slice(coord.times.length - get, coord.times.length);
						let samples = coord.raw.slice(coord.raw.length - get, coord.raw.length);
						return { times: times, samples: samples };
					}
					else {
						return undefined;
					}
				}
				else {
					return undefined;
				}
			}
		}

		let getEEGFFTData = (device, channel, nArrays = 'all') => {
			let get = nArrays;
			if (device?.info?.useAtlas === true) {
				let coord = false;
				if (typeof channel === 'number') {
					coord = device.atlas.getEEGFFTData(channel);
				}
				else {
					coord = device.atlas.getEEGDataByTag(channel);
				}
				if (coord !== undefined) {
					if (get === 'all') {
						if (coord.fftCount === 0) return undefined;
						get = coord.fftCount - coord.lastReadFFT;
						coord.lastReadFFT = coord.fftCount;
						if (get === 0) return undefined;
					}
					let fftTimes = coord.fftTimes.slice(coord.fftTimes.length - get, coord.fftTimes.length);
					let ffts = coord.ffts.slice(coord.ffts.length - get, coord.ffts.length);
					return { times: fftTimes, ffts: ffts };
				}
				else {
					return undefined;
				}
			}
		}

		let getEEGBandpowerMeans = (device, channel) => {
				if (device?.info?.useAtlas === true) {
					let coord = false;

					coord = device.atlas.getLatestFFTData(channel)[0];

					if (coord !== undefined) {
						return { time: coord.time, bandpowers: coord.mean };
					}
					else {
						return undefined;
					}
			}
		}

		let getEEGCoherenceBandpowerMeans = (device, channel) => {
				if (device?.info?.useAtlas === true) {
					let coord = false;

					coord = device.atlas.getLatestCoherenceData(channel);

					if (coord !== undefined) {
						return { time: coord.time, bandpowers: coord.mean };
					}
					else {
						return undefined;
					}
				}
		}

		let getEEGBandpowerSlices = (device, channel) => {
				if (device?.info?.useAtlas === true) {
					let coord = false;

					coord = device.atlas.getLatestFFTData(channel)[0];

					if (coord !== undefined) {
						return { time: coord.time, bandpowers: coord.slice };
					}
					else {
						return undefined;
					}
				}
		}

		let getEEGCoherenceBandpowerSlices = (device, channel) => {
				if (device?.info?.useAtlas === true) {
					let coord = false;

					coord = device.atlas.getLatestCoherenceData(channel)[0];

					if (coord !== undefined) {
						return { time: coord.time, bandpowers: coord.slice };
					}
					else {
						return undefined;
					}
				}
		}

		let getCoherenceData = (device, tag, nArrays = 'all') => {
			let get = nArrays;
				if (device?.info?.useAtlas === true) {
					let coord = device.atlas.getCoherenceByTag(tag);
					if (coord !== undefined) {
						if (get === 'all') {
							if (coord.fftCount === 0) return undefined;
							get = coord.fftCount - coord.lastRead;
							coord.lastRead = coord.fftCount;
							if (get === 0) return undefined;
						}
						let cohTimes = coord.times.slice(coord.fftTimes.length - get, coord.fftTimes.length);
						let ffts = coord.ffts.slice(coord.ffts.length - get, coord.ffts.length);
						return { times: cohTimes, ffts: ffts };
					}
					else {
						return undefined;
					}
			}
		}

		let getHEGData = (device, tag = 0, nArrays = 'all', prop = undefined) => {
			let get = nArrays;
			if (device?.info?.useAtlas === true) {
				let coord = device.atlas.getDeviceDataByTag('heg', tag);
				if (get === 'all') {
					get = coord.count - coord.lastRead;
					coord.lastRead = coord.count;
					if (get <= 0) return undefined;
				}
				if (coord !== undefined) {
					if (prop !== undefined) {
						let times = coord.times.slice(coord.times.length - get, coord.times.length);
						let data = coord[prop].slice(coord.ffts.length - get, coord.ffts.length);
						let obj = { times: times }; obj[prop] = data;
						return obj;
					}
					else return coord;
				}
				else {
					return undefined;
				}
			}
		}

		this.streamTable = [
			{ prop: 'eegch', callback: getEEGChData },
			{ prop: 'eegfft', callback: getEEGFFTData },
			{ prop: 'eegcoherence', callback: getCoherenceData },
			{ prop: 'eegfftbands', callback: getEEGBandpowerMeans },
			{ prop: 'eegcoherencebands', callback: getEEGCoherenceBandpowerMeans },
			{ prop: 'eegfftbandslices', callback: getEEGBandpowerSlices },
			{ prop: 'eegcoherencebandslices', callback: getEEGCoherenceBandpowerSlices },
			{ prop: 'hegdata', callback: getHEGData }
		];

		if (params.length > 0) {
			this.streamTable.push(...params);
		}
	}

	addStreamFunc(name = '', callback = () => { }) {
		this.streamTable.push({ prop: name, callback: callback });
	}

	removeStreamFunc(name='') {
		this.streamTable.find((o,i) => {
			if(o.prop === name){
				return this.streamTable.splice(i,1);
			}
		})
	}

	configureStreamParams(params = [['prop', 'tag']]) { //Simply defines expected data parameters from the user for server-side reference
		let propsToSend = [];
		params.forEach((param, i) => {
			propsToSend.push(param.join('_'));
		});
		this.sendBrainstormCommand(['addProps', propsToSend]);
	}

	//pass array of arrays defining which datasets you want to pull from according to the available
	// functions and additional required arguments from the streamTable e.g.: [['eegch','FP1'],['eegfft','FP1']]
	getDataForSocket = (device = undefined, params = [['prop', 'tag', 'arg1']]) => {
		let userData = {};
		params.forEach((param, i) => {
				this.streamTable.find((option, i) => {
					if (param[0] === option.prop) {
						let args;
						if (device) args = [device, ...param.slice(1)];
						else args = param.slice(1);
						let result = (args.length !== 0) ? option.callback(...args) : option.callback()
						if (result !== undefined) {
							if (param[2] !== 'ignore'){
								userData[param.join('_')] = result;
							}
						}
						return true;
					}
				});
		});

		return userData;
		// if(Object.keys(streamObj.userData).length > 0) {
		// 	this.socket.send(JSON.stringify(streamObj));
		// }
	}

	streamLoop = (prev = {}) => {
		let streamObj = {
			id: this.info.auth.id,
			userData: {}
		}
		if (this.info.streaming === true && this.socket.readyState === 1) {

			this.deviceStreams.forEach((d) => {
				if (this.info.nDevices < this.deviceStreams.length) {
					if (!streamObj.userData.devices) streamObj.userData.devices = [];
					streamObj.userData.devices.push(d.info.deviceName);
					this.info.nDevices++;
				}
				let params = [];
				this.info.deviceStreamParams.forEach((param, i) => {
					if (this.info.deviceStreamParams.length === 0) { console.error('No stream parameters set'); return false; }
					if (param[0].indexOf(d.info.deviceType) > -1) {
						params.push(param);
					}
				});
				if (params.length > 0) {
					Object.assign(streamObj.userData, this.getDataForSocket(d, params));
				}
			});
			Object.assign(streamObj.userData, this.getDataForSocket(undefined, this.info.appStreamParams));
			//if(params.length > 0) { this.sendDataToSocket(params); }

			if (this.info.subscriptions.length > 0){ // Only stream if subscription is established
				if (Object.keys(streamObj.userData).length > 0) {
					this.socket.send(JSON.stringify(streamObj));
				}
			}

			this.info.streamCt++;
			setTimeout(() => { this.streamLoop(); }, this.info.streamLoopTiming);
		}
		else {
			this.getDataForSocket(undefined, this.info.appStreamParams) 
			this.info.streamCt = 0;
			setTimeout(() => { this.streamLoop(); }, this.info.streamLoopTiming);
		}
	}
}