//summon the web bci app browser/launcher/manager from here


//Setup State
//Setup Templates & UI Logic i.e. applet and file selection menus, and general BCI control menus
//Setup UI Manager
//  -- Setup App Browser and cross-app accessible data via the state manager
//  -- Setup BCI controls e.g. to control analysis on-the-fly.
//Setup BrowserFS logic for indexedDB

import {
    page_template,
    topbar_template,
    appletbox_template,  
    appletselect_template,
    filemenu_template,
    file_template,
} from './menus/UITemplates'

import {AppletManager} from './utils/AppletManager'
import {CSV} from '../general/csv'
import { StateManager } from './utils/StateManager';
import { DOMFragment } from './utils/DOMFragment';

import * as BrowserFS from 'browserfs'
const fs = BrowserFS.BFSRequire('fs')
const BFSBuffer = BrowserFS.BFSRequire('buffer').Buffer;



/*
//Name applets and their template classes with specifications for the UI manager
//Append these with the applets you write that you want to load into the frontend on the dev build
export defaultBCIApplets = [ 
            { name:"uPlot Applet",         cls: uPlotApplet        },
            { name:"SmoothieJS Applet",    cls: SmoothieApplet     },
            { name:"BrainMap Applet",      cls: BrainMapApplet     },
            { name:"Spectrogram Applet",   cls: SpectrogramApplet  },
            { name:"BarChart Applet",      cls: BarChartApplet     },
            { name:"MirrorBars Applet",    cls: MirrorBarsApplet   },
            { name:"TimeCharts Applet",    cls: TimeChartsApplet   }
        ]; 
*/

export class BCIAppManager {
    constructor(
        bcisession=null,
        appletClasses=[],   //expects an object array formatted like [{name:"uPlot Applet", cls: uPlotApplet},{}] to set available applets in the browser
        appletConfigs=[],   //expects an object array like           [{name:"",idx:n,settings:["a","b","c"]},{...}] to set initial applet configs (including objects found from hashtags in the address bar)
        useFS=false         //launch with browserfs initialized
    ) {

        this.state = new StateManager({
            sessionName:'',
            saveChunkSize:0,
            saveChunkSize:5120,
            saveIdx:0,
            newSessionCt:0,
            fileSizeLimitMb: 250
        });

        this.uiFragments = {}; //store DOMFragments for the UI here

        this.bcisession = bcisession; //brainsatplay class instance
        this.appletClasses = appletClasses;
        this.appletConfigs = appletConfigs;
        this.appletConfigs.push(...this.getConfigsFromHashes());
        this.appletManager;
        this.fs;
        this.useFS = useFS;

        if(this.useFS === true) {
            this.initFS();
        }

    }

    setupUITemplates = () => {
        // Navigation Sidebar
        let connectHTML = `
        <div id="sidebar-container">
            <div id="sidebar">
            <div id="sidebar-inner">
                <div class="logo-container">
                    <img class="logo" src="./logo512.png">
                </div>
                <div class="collapsible-container">
                    <button class="collapsible">File System</button>
                    <div class="content">
                        <p>Lorem ipsum...</p>
                    </div>
                    </div>
                    <div class="collapsible-container">
                    <button class="collapsible">Dev Tools</button>
                    <div class="content">
                        <button id='server'>Connect to Server</button>
                        <button id='ping'>Send Ping</button>
                        <button id='getusers'>Get Users</button>
                        <button id='createGame'>Make Game session</button>
                        <button id='subscribeToGame'>Subscribe to game session (connect device first)</button>
                        <button id='subscribeToSelf'>Subscribe to self</button>
                    </div>
                    </div>
                    </div>
            </div>
            <div id="sidebar-toggle"></div>
            <div class="overlay"></div>
        </div>
        `; 

        this.uiFragments.Buttons = new DOMFragment(
        connectHTML,
        document.body,
        undefined,
        () => {
            // document.getElementById('connect').onclick = () => {
            // 	if(bcisession.info.auth.authenticated) bcisession.connect('freeeeg32_2',['eegcoherence'],onconnected,undefined,true,[['eegch','FP1','all'],['eegch','FP2','all']]);
            // 	else bcisession.connect('freeeeg32_2',['eegcoherence'],onconnected);
            // 	// if(bcisession.info.auth.authenticated) bcisession.connect('muse',['eegcoherence'],true,[['eegch','AF7','all'],['eegch','AF8','all']]);
            // 	// else bcisession.connect('muse',['eegcoherence']);
            // }

            document.getElementById('server').onclick = () => {
                this.bcisession.login(true);
                //console.log(bcisession.socket.url);
            }
            document.getElementById('ping').onclick = () => {
                this.bcisession.sendWSCommand(['ping']); //send array of arguments
            }
            document.getElementById('getusers').onclick = () => {
                this.bcisession.sendWSCommand(['getUsers']);
            }
            document.getElementById('createGame').onclick = () => {
                this.bcisession.sendWSCommand(['createGame',this.bcisession.info.auth.appname,['freeeeg32'],['eegch_FP1','eegch_FP2']]);
                //bcisession.sendWSCommand(['createGame','game',['muse'],['eegch_AF7','eegch_AF8']]);
            }
            document.getElementById('subscribeToGame').onclick = () => {
                this.bcisession.subscribeToGame(undefined,false,(res)=>{console.log("subscribed!", res)});
            }
            document.getElementById('subscribeToSelf').onclick = () => {
                this.bcisession.addStreamParam([['eegch','FP1','all'],['eegch','FP2','all']]);
                //bcisession.addStreamParam([['eegch','AF7','all'],['eegch','AF8','all']]);
                this.bcisession.subscribeToUser('guest',[['eegch','FP1',],['eegch','FP2']],(res)=>{console.log("subscribed!", res)});
                //bcisession.subscribeToUser('guest',['eegch_AF7','eegch_AF8'],(res)=>{console.log("subscribed!", res)});
            }
        },
        undefined,
        'NEVER'
        );

        var coll = document.getElementsByClassName("collapsible");
        var i;
        for (i = 0; i < coll.length; i++) {
            coll[i].nextElementSibling.style.opacity = '0'
          coll[i].addEventListener("click", function() {
            // this.classList.toggle("active");
            var content = this.nextElementSibling;
            if (content.style.opacity === "0") {
                content.style.opacity = "1";
                content.style.right = `-${content.clientWidth}px`;
                content.style.pointerEvents = 'auto'
                Array.from(document.getElementsByClassName("collapsible")).forEach(toggleButton => {
                    let overlay = toggleButton.nextElementSibling
                    if (overlay.style.opacity === "1" && overlay != content){
                        overlay.style.opacity = "0";
                        overlay.style.right = "0";
                        overlay.style.pointerEvents = 'none'              
                    }
                })
            } else {
                content.style.opacity = "0";
                content.style.right = "0";
                content.style.pointerEvents = 'none'      
            }
          });
          coll[i].nextElementSibling.addEventListener('mouseout', function() {
            this.style.opacity = "0";
            this.style.right = "0";
            this.style.pointerEvents = 'none'
        })
        coll[i].nextElementSibling.addEventListener('mouseover', function() {
            this.style.opacity = "1";
            this.style.right = `-${this.clientWidth}px`;
            this.style.pointerEvents = 'auto'
      })
        }

        document.body.style.overflow = "hidden";


        this.uiFragments.page = new DOMFragment(
            page_template,
            document.body
        );
        this.uiFragments.topbar = new DOMFragment(
            topbar_template,
            document.getElementById('page')
        );
        this.uiFragments.select = new DOMFragment(
            appletselect_template,
            document.getElementById('topbar')
        );
        this.bcisession.makeConnectOptions(document.getElementById('topbar'));
        if(this.useFS) {
            this.uiFragments.filemenu = new DOMFragment(
                filemenu_template,
                document.body
            )
        }
        this.uiFragments.appletbox = new DOMFragment(
            appletbox_template,
            document.getElementById('page'),
            {
                containerId:'applets', 
                styleInlineText:''
            }
        );
    }

    initUI = () => { //Setup all of the UI rendering and logic/loops for menus and other non-applet things

        this.bcisession.onconnected = () => {
            //this.appletManager.reinitApplets();
            this.appletManager.deinitApplets();
            this.appletManager.initAddApplets();
            this.appletManager.responsive();
        }
        this.setupUITemplates();
    }

    deinitUI = () => { //Destroy the UI and logic/loops
        this.uiFragments.appletbox.deleteNode();
        this.uiFragments.select.deleteNode();
        this.uiFragments.filemenu.deleteNode();
        this.uiFragments.Buttons.deleteNode();
    }

    getConfigsFromHashes() {
        let hashes = window.location.hash;
        if(hashes === "") { return [] }
        let hasharr = hashes.split('#');
        hashes.shift();
    
        var appletConfigs = [];
        hasharr.forEach((hash,i) => {
            var cfg = JSON.parse(hash); // expects cfg object on end of url like #{name:"",idx:n,settings:["a","b","c"]}#{...}#...
            appletConfigs.push(cfg);
        });
        return appletConfigs;    
    }

    init = (settingsFileContents='') => {

        // ------ need to flesh this out -------
        if(settingsFileContents.length > 0){
            let settings = JSON.parse(settingsFileContents);
            if(settings.appletConfigs) {
                this.appletConfigs = settings.appletConfigs;
            }
        }
        let configs = this.getConfigsFromHashes(); //overrides old settings
        if(configs.length === null){
            this.appletConfigs = configs;
        }
        // -------------------------------------
        
        this.appletManager = new AppletManager(
            this.initUI,
            this.deinitUI,
            this.appletClasses,
            this.appletConfigs,
            ['applet1','applet2','applet3','applet4'], //defined in the appletselect template
            this.bcisession
        )
    }

    setApps( //set the apps and create a new UI or recreate the original
        appletClasses=this.appletClasses,  //expects an object array formatted like [{name:"uPlot Applet", cls: uPlotApplet},{}] to set available applets in the browser
        appletConfigs=this.appletConfigs   //expects an object array like           [{name:"uPlot Applet",idx:0-3,settings:["a","b","c"]},{...}] to set initial applet configs (including objects found from hashtags in the address bar)
    ) {
        this.appletClasses = appletClasses;
        this.appletConfigs = appletConfigs;

        if(this.appletManager === null) {
            this.init();
        }
        else {
            this.appletManager.deinitApplets();
            this.appletManager.deinitUI();
            this.init();
        }
    }

    //Inits the AppletManager within the context of the filesystem so the data can be autosaved on demand (there should be a better method than mine)
    initFS = () => {
        let oldmfs = fs.getRootFS();
        BrowserFS.FileSystem.IndexedDB.Create({}, (e, rootForMfs) => {
            if(!rootForMfs) {
                let configs = this.getConfigsFromHashes();
                this.appletManager = new AppletManager(this.initUI, this.deinitUI, this.appletClasses, configs,undefined,this.bcisession);
                throw new Error(`?`);
            }
            BrowserFS.initialize(rootForMfs);
            fs.exists('/data', (exists) => {
                if(exists) { }
                else {
                    fs.mkdir('/data');
                }
                let contents = "";
                fs.appendFile('/data/settings.json','',(e) => {
                    if(e) throw e;
                    fs.readFile('/data/settings.json', (err, data) => {
                        if(err) {
                            fs.mkdir('/data');
                            fs.writeFile('/data/settings.json',
                            JSON.stringify(
                                {
                                    appletConfigs:this.appletConfigs
                                }
                            ), (err) => {
                                let configs = getConfigsFromHashes();
                                this.appletManager = new AppletManager(this.initUI, this.deinitUI, this.appletClasses, configs,undefined,this.bcisession);
                                if(err) throw err;
                            });
                        }
                        if(!data) {
                            let newcontent = 
                                JSON.stringify({
                                    appletConfigs:[]
                                });
                            contents = newcontent;
                            fs.writeFile('/data/settings.json', newcontent, (err) => {
                                if(err) throw err;
                                console.log("New settings file created");
                                this.initAppletManager(contents);
                                listFiles();
                            });
                        }
                        else{ 
                            contents = data.toString();    
                            initAppletManager(contents);
                            listFiles();
                        }

                        //configure autosaving when the device is connected
                        this.bcisession.state.data.info = this.bcisession.info;
                        this.bcisession.state.subscribe('info',(info) => {
                            if(info.nDevices > 0) {
                                if(this.bcisession.devices[info.nDevices-1].info.deviceType === 'eeg') {
                                    this.bcisession.subscribe(this.bcisession.devices[info.nDevices-1].info.deviceName, this.bcisession.devices[info.nDevices-1].info.eegChannelTags[0].ch,'count', (c) => {
                                        if(c - this.state.data.saveCounter >= this.state.data.saveChunkSize) {
                                            autoSaveEEGChunk();
                                            this.state.data.saveCounter = c;
                                        }
                                    });
                                    document.getElementById("saveEEGSession").onclick = () => {
                                        autoSaveEEGChunk();
                                    }
                                    document.getElementById("newEEGSession").onclick = () => {
                                        newSession();
                                    }
                                }
                            }
                        });
                    });
                });
            });
    
            const newSession = () => {
                let sessionName = new Date().toISOString(); //Use the time stamp as the session name
                this.state.data.sessionName = sessionName;
                this.state.data.sessionChunks = 0;
                this.state.data.saveChunkSize = 5120;
                this.state.data.newSessionCt++;
                fs.appendFile('/data/'+sessionName,"", (e) => {
                    if(e) throw e;
                    listFiles();
                });
            }

            const deleteFile = (path) => {
                fs.unlink(path, (e) => {
                    if(e) console.error(e);
                    listFiles();
                });
            }
    
            const listFiles = () => {
                fs.readdir('/data', (e,dirr) => { 
                    if(e) return;
                    if(dirr) {
                        console.log("files",dirr)
                        let filediv = document.getElementById("filesystem");
                        filediv.innerHTML = "";
                        dirr.forEach((str,i) => {
                            if(str !== "settings.json"){
                                filediv.innerHTML += file_template({id:str});
                            }
                        });
                        dirr.forEach((str,i) => {
                            if(str !== "settings.json") {
                                document.getElementById(str+"svg").onclick = () => {
                                    console.log(str);
                                    writeToCSV(str);
                                } 
                                document.getElementById(str+"delete").onclick = () => { 
                                    deleteFile("/data/"+str);
                                } 
                            }
                        });
                    }
                });
            }

            const autoSaveEEGChunk = (startidx=0,to='end') => {
                let from = startidx; 
                if(this.state.data.sessionChunks > 0) { from = this.state.data.saveCounter; }
    
                let data = this.bcisession.devices[0].atlas.readyEEGDataForWriting(from,to);
                console.log("Saving chunk to /data/"+this.state.data.sessionName,this.state.data.sessionChunks);
                if(this.state.data.sessionChunks === 0) {
                    fs.appendFile('/data/'+this.state.data.sessionName, data[0]+data[1], (e) => {
                        if(e) throw e;
                        this.state.data.sessionChunks++;
                        listFiles();
                    }); //+"_c"+State.data.sessionChunks
                    
                }
                else {
                    fs.appendFile('/data/'+this.state.data.sessionName, "\n"+data[1], (e) => {
                        if(e) throw e;
                        this.state.data.sessionChunks++;
                    }); //+"_c"+State.data.sessionChunks
                }
                
            }
                
            //Read a chunk of data from a saved dataset
            const readFromDB = (path,begin=0,end=5120) => {
                fs.open('/data/'+path,'r',(e,fd) => {
                    if(e) throw e;
                
                    fs.read(fd,end,begin,'utf-8',(er,output,bytesRead) => { 
                        if (er) throw er;
                        if(bytesRead !== 0) {
                            let data = output.toString();
                            //Now parse the data back into the buffers.
                            return data;
                        };
                    }); 
                });
            }

            //Write CSV data in chunks to not overwhelm memory
            const writeToCSV = (path) => {
                fs.stat('/data/'+path,(e,stats) => {
                    if(e) throw e;
                    let filesize = stats.size;
                    console.log(filesize)
                    fs.open('/data/'+path,'r',(e,fd) => {
                        if(e) throw e;
                        let i = 0;
                        let maxFileSize = this.state.data.fileSizeLimitMb*1024*1024;
                        let end = maxFileSize;
                        if(filesize < maxFileSize) {
                            end = filesize;
                            fs.read(fd,end,0,'utf-8',(e,output,bytesRead) => { 
                                if (e) throw e;
                                if(bytesRead !== 0) CSV.saveCSV(output.toString(),path);
                            }); 
                        }
                        else {
                            const writeChunkToFile = () => {
                                if(i < filesize) {
                                    if(i+end > filesize) {end=filesize - i;}  
                                    let chunk = 0;
                                    fs.read(fd,end,i,'utf-8',(e,output,bytesRead) => {   
                                        if (e) throw e;
                                        if(bytesRead !== 0) {
                                            CSV.saveCSV(output.toString(),path+"_"+chunk);
                                            i+=maxFileSize;
                                            chunk++;
                                            writeChunkToFile();
                                        }
                                    });
                                }
                            }  
                        }
                        //let file = fs.createWriteStream('./'+State.data.sessionName+'.csv');
                        //file.write(data.toString());
                    }); 
                });
                
            }

            const saveSettings = () => {
                fs.writeFile('/data/settings.json',
                JSON.stringify({   
                        appletConfigs:this.appletConfigs
                    }
                ), (err) => {
                    if(err) throw err;
                });
            }

        });
    }

}
