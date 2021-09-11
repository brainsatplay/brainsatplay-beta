import {ObjectListener} from './ObjectListener'

//By Joshua Brewster (MIT License)
//Simple state manager.
//Set key responses to have functions fire when keyed values change
//add variables to state with addToState(key, value, keyonchange (optional))
export class StateManager {
    constructor(init = {}, interval="FRAMERATE", defaultKeyEventLoop=true) { //Default interval is at the browser framerate
        this.data = init;
        this.interval = interval;
        this.pushToState={};
        this.pushRecord={pushed:[]}; //all setStates between frames
        this.pushCallbacks = {};
        this.triggers = {};

        this.listener = new ObjectListener();
        this.defaultStartListenerEventLoop = defaultKeyEventLoop;

        /*
        this.prev = Object.assign({},this.data);
         
        const onStateChanged = () => {
            this.prev = Object.assign({},this.data);
            //this.prev=JSON.parse(JSON.stringifyFast(this.data));
        }

        //Causes app to be stuck on startup
        this.listener.addListener(
            "state",
            this.data,
            "__ANY__",
            onStateChanged,
            interval,
        );
        */
    }

    setInterval(interval="FRAMERATE") {
        this.interval = interval;
        this.listener.listeners.forEach((obj,i) => {
            obj.interval = this.interval;
        });
    }


    // Managed State Updates. Must Still Clean Event Listeners
    updateState(key, value){
        if (this.data[key] == null){
            this.addToState(key,value)
        } else {
            this.data[key] = value
        }    
    }

    removeState(key, sequential=false){
            if (sequential) this.unsubscribeAllSequential(key);
            else this.unsubscribeAll(key);
            delete this.data[key]

            // Log Update
            this.setSequentialState({stateRemoved: key})
    }

    setupSynchronousUpdates = () => {
        if(!this.listener.hasKey('pushToState')) {
            //we won't add this listener unless we use this function
            const pushToStateResponse = () => {
                if(Object.keys(this.pushToState).length > 0) {
                    //Object.assign(this.prev,this.data);//Temp fix until the global state listener function works as expected
                    Object.assign(this.data,this.pushToState);

                    //console.log("new state: ", this.data); console.log("props set: ", this.pushToState);
                    for (const prop of Object.getOwnPropertyNames(this.pushToState)) {
                        delete this.pushToState[prop];
                    }
                }
            }
    
            this.listener.addListener(
                "pushToState",
                this.pushToState,
                "__ANY__",
                pushToStateResponse,
                this.interval
            );

            this.addToState('pushRecord',this.pushRecord,(record)=>{

                let l = record.pushed.length;
                for (let i = 0; i < l; i++){
                    let updateObj = record.pushed[i];
                    for(const prop in updateObj) {
                        if(this.pushCallbacks[prop]) {
                            this.pushCallbacks[prop].forEach((o) =>{
                                o.onchange(updateObj[prop]);
                            });
                        }
                    }
                }
                this.pushRecord.pushed.splice(0,l);
            });

            this.data.pushCallbacks = this.pushCallbacks;

        }
    }

    //Alternatively just add to the state by doing this.state[key] = value with the state manager instance
    addToState(key, value, onchange=null, startRunning=this.defaultStartListenerEventLoop, debug=false) {
        if(!this.listener.hasKey('pushToState')) {
            this.setupSynchronousUpdates();
        }

        this.data[key] = value;

        // Log Update
        this.setSequentialState({stateAdded: key})

        if(onchange !== null){
            return this.addSecondaryKeyResponse(key,onchange,debug,startRunning);
        }
    }

    getState() { //Return a hard copy of the latest state with reduced values. Otherwise just use this.state.data
        return JSON.parse(JSON.stringifyFast(this.data));
    }

    //Synchronous set-state, only updates main state on interval. Can set to trigger now instead of waiting on interval. Also can append arrays in state instead of replacing them
    setState(updateObj={}, appendArrs=false){ //Pass object with keys in. Undefined keys in state will be added automatically. State only notifies of change based on update interval
        //console.log("setting state");
        if(!this.listener.hasKey('pushToState')) {
            this.setupSynchronousUpdates();
        }

        updateObj.stateUpdateTimeStamp = Date.now();
        this.pushRecord.pushed.push(JSON.parse(JSON.stringifyWithCircularRefs(updateObj)));
        
        if(appendArrs) {
            for(const prop in updateObj) { //3 object-deep array checks to buffer values instead of overwriting
                if(this.pushToState[prop]) {
                    if(Array.isArray(this.pushToState[prop]) && Array.isArray(updateObj[prop])) {
                        updateObj[prop] = this.pushToState[prop].push(...updateObj[prop]);
                    } else if (typeof this.pushToState[prop] === 'object' && typeof updateObj[prop] === 'object') {
                        for(const p in updateObj[prop]) {
                            if(this.pushToState[prop][p]) {
                                if(Array.isArray(this.pushToState[prop][p]) && Array.isArray(updateObj[prop][p])) {
                                    updateObj[prop][p] = this.pushToState[prop][p].push(...updateObj[prop][p]);
                                }
                                else if (typeof this.pushToState[prop][p] === 'object' && typeof updateObj[prop][p] === 'object') {
                                    for(const p2 in updateObj[prop][p]) {
                                        if(this.pushToState[prop][p][p2]) {
                                            if(Array.isArray(this.pushToState[prop][p][p2]) && Array.isArray(updateObj[prop][p][p2])) {
                                                updateObj[prop][p][p2] = this.pushToState[prop][p][p2].push(...updateObj[prop][p][p2]);
                                            }
                                        }
                                        else if (typeof this.pushToState[prop][p][p2] === 'object' && typeof updateObj[prop][p][p2] === 'object') {
                                            for(const p3 in updateObj[prop][p][p2]) {
                                                if(this.pushToState[prop][p][p2][p3]) {
                                                    if(Array.isArray(this.pushToState[prop][p][p2][p3]) && Array.isArray(updateObj[prop][p][p2][p3])) {
                                                        updateObj[prop][p][p2][p3] = this.pushToState[prop][p][p2][p3].push(...updateObj[prop][p][p2][p3]);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Object.assign(this.pushToState,updateObj);

        return this.pushToState;
    }

    //setState but also run triggers, allows subscribing to the same key in state without interrupting anything
    setState_T(updateObj={}) {
        
        Object.assign(this.pushToState,updateObj); //also copy the data for the event listener loop

        if(Object.keys(this.pushToState).length > 0) {
            Object.assign(this.data,this.pushToState);
            for (const prop of Object.getOwnPropertyNames(updateObj)) {
                if(this.triggers[key]) {
                    this.triggers[key].forEach((obj)=>{
                        obj.onchange(updateObj[key]);
                    });
                }
                delete this.pushToState[prop];
            }
        }

        return this.pushToState;
    }

    //Trigger-only functions on otherwise looping listeners
    subscribeTrigger(key=undefined,onchange=(prop)=>{}) {
        if(key) {
            if(!this.triggers[key]) {
                this.triggers[key] = [];
            }
            this.triggers[key].push({idx:this.triggers[key].length-1, onchange:onchange});
            return this.triggers[key].length-1;
        } else return undefined;
    }

    //Delete specific trigger functions for a key
    unsubscribeTrigger(key=undefined,sub=0) {
        let idx = undefined;
        let obj = this.triggers[key].find((o)=>{
            if(o.idx===sub) {return true;}
        });
        if(obj) this.triggers[key].splice(idx,1);
    }

    //Remove all triggers for a key
    unsubscribeAllTriggers(key) {
        if(key && this.triggers[key]) {
            delete this.triggers[key];
        }
    }

    //only push to an object that keeps the sequences of updates instead of synchronously updating the whole state.
    setSequentialState(updateObj={}) {
        //console.log("setting state");
        if(!this.listener.hasKey('pushToState')) {
            this.setupSynchronousUpdates();
        }
        updateObj.stateUpdateTimeStamp = Date.now();
        this.pushRecord.pushed.push(JSON.parse(JSON.stringify(updateObj)));
    }

    subscribeSequential(key=undefined,onchange=undefined) {
        if(key) {
            
            if(this.data[key] === undefined) {this.addToState(key,null,undefined);}

            if(!this.pushCallbacks[key])
                this.pushCallbacks[key] = [];

            if(onchange) {
                let idx = this.pushCallbacks[key].length;
                this.pushCallbacks[key].push({idx:idx, onchange:onchange});
                return this.pushCallbacks[key].length-1; //get key sub index for unsubscribing
            } 
            else return undefined;
        } else return undefined;
    }

    unsubscribeSequential(key=undefined,sub=0) {
        if(key){
            if(this.pushCallbacks[key]) {
                if(this.pushCallbacks[key].find((o,j)=>{
                    if(o.idx === sub) {
                        this.pushCallbacks[key].splice(j,1);
                        return true;
                    }
                })) {
                }
            }
        }
    }

    unsubscribeAllSequential(key) {
        if(key) {
            if(this.pushCallbacks[key]) {
                if(this.pushCallbacks[key]) {
                    delete this.pushCallbacks[key];
                }
            }
        }
    }

    //Set main onchange response for the property-specific object listener. Don't touch the state
    setPrimaryKeyResponse(key=null, onchange=null, debug=false, startRunning=this.defaultStartListenerEventLoop) {
        if(onchange !== null){
            if(this.listener.hasKey(key)){
                this.listener.onchange(key, onchange);
            }
            else if(key !== null){
                this.listener.addListener(key, this.data, key, onchange, this.data["stateUpdateInterval"], debug, startRunning);
            }
        }
    }

    //Add extra onchange responses to the object listener for a set property. Use state key for state-wide change responses
    addSecondaryKeyResponse(key=null, onchange=null, debug=false, startRunning=this.defaultStartListenerEventLoop) {
        if(onchange !== null){
            if(this.listener.hasKey(key)){
                return this.listener.addFunc(key, onchange);
            }
            else if(key !== null){
                this.listener.addListener(key, this.data,key,()=>{},this.data["stateUpdateInterval"], debug, startRunning);
                return this.listener.addFunc(key, onchange);
            }
            else { return this.listener.addFunc("state", onchange);}
        }
    }

    //removes all secondary responses if idx left null. use "state" key for state-wide change responses
    removeSecondaryKeyResponse(key=null,responseIdx=null, stopIfEmpty=true) {
        if(key !== null) {
            if(this.listener.hasKey(key)){
                this.listener.removeFuncs(key, responseIdx, stopIfEmpty);
            } else {
                console.error("key does not exist")
            }
        }
        else{console.error("provide key")}
    }

    //Remove any extra object listeners for a key. Entering "state" will break the state manager's primary response
    clearAllKeyResponses(key=null) {
        if(key === null) this.listener.remove(null);
        else if(this.listener.hasKey(key)) this.listener.remove(key);
    }

    //Get all of the onchange functions added via subscribe/addSecondaryKeyResponse
    getKeySubCallbacks(key) {
        let callbacks = this.listener.getFuncs(key);
        return callbacks;
    }

    //Save the return value to provide as the responseIdx in unsubscribe
    subscribe(key, onchange, startRunning=true) {
        if(this.data[key] === undefined) {this.addToState(key,null,onchange);}
        else {return this.addSecondaryKeyResponse(key,onchange);}
    }
    
    //Unsubscribe from the given key using the index of the response saved from the subscribe() function
    unsubscribe(key, responseIdx=null) {
        if(responseIdx !== null) this.removeSecondaryKeyResponse(key, responseIdx, true);
        else console.error("Specify a subcription function index");
    }

    unsubscribeAll(key) { // Removes the listener for the key (including the animation loop)
        this.clearAllKeyResponses(key);
    }

    //runs only one animation frame to check all state keys
    runSynchronousListeners() {
        this.defaultStartListenerEventLoop = false;
        this.listener.startSync();
    }

    //stops the listener event loops without clearing the keys.
    stop(key=null) {
        this.listener.stop(key);
    }

}


//modified to also cut down the size arrays for faster looping
if(JSON.stringifyFast === undefined) {
    //Workaround for objects containing DOM nodes, which can't be stringified with JSON. From: https://stackoverflow.com/questions/4816099/chrome-sendrequest-error-typeerror-converting-circular-structure-to-json
    JSON.stringifyFast = (function() {
        const refs = new Map();
        const parents = [];
        const path = ["this"];

        function clear() {
            refs.clear();
            parents.length = 0;
            path.length = 1;
        }

        function updateParents(key, value) {
            var idx = parents.length - 1;
            //console.log(idx, parents[idx])
            if(parents[idx]){
                var prev = parents[idx];
                //console.log(value); 
                if (prev[key] === value || idx === 0) {
                    path.push(key);
                    parents.push(value.pushed);
                } else {
                    while (idx-- >= 0) {
                    prev = parents[idx];
                    if (prev[key] === value) {
                        idx += 2;
                        parents.length = idx;
                        path.length = idx;
                        --idx;
                        parents[idx] = value;
                        path[idx] = key;
                        break;
                    }
                    }
                }
            }
        }

        function checkValues(key, value) {
            let val;
            if (value != null) {
                if (typeof value === "object") {
                    //if (key) { updateParents(key, value); }
                    let c = value.constructor.name;
                    if (key && c === 'Object') {updateParents(key, value); }

                    let other = refs.get(value);
                    if (other) {
                        return '[Circular Reference]' + other;
                    } else {
                        refs.set(value, path.join('.'));
                    }
                    if(c === "Array") { //Cut arrays down to 100 samples for referencing
                        if(value.length > 20) {
                            val = value.slice(value.length-20);
                        } else val = value;
                       // refs.set(val, path.join('.'));
                    }  
                    else if (c.includes("Set")) {
                        val = Array.from(value)
                    }  
                    else if (c !== "Object" && c !== "Number" && c !== "String" && c !== "Boolean") { //simplify classes, objects, and functions, point to nested objects for the state manager to monitor those properly
                        val = "instanceof_"+c;
                    }
                    else if (c === 'Object') {
                        let obj = {};
                        for(const prop in value) {
                            if (value[prop] == null){
                                obj[prop] = value[prop]; 
                            }
                            else if(Array.isArray(value[prop])) { 
                                if(value[prop].length>20)
                                    obj[prop] = value[prop].slice(value[prop].length-20); 
                                else obj[prop] = value[prop];
                            } //deal with arrays in nested objects (e.g. means, slices)
                            else if (value[prop].constructor.name === 'Object') { //additional layer of recursion for 3 object-deep array checks
                                obj[prop] = {};
                                for(const p in value[prop]) {
                                    if(Array.isArray(value[prop][p])) {
                                        if(value[prop][p].length>20)
                                            obj[prop][p] = value[prop][p].slice(value[prop][p].length-20); 
                                        else obj[prop][p] = value[prop][p];
                                    }
                                    else { 
                                        if (value[prop][p] != null){
                                            let con = value[prop][p].constructor.name;
                                            if (con.includes("Set")) {
                                                obj[prop][p] = Array.from(value[prop][p])
                                            } else if(con !== "Number" && con !== "String" && con !== "Boolean") {
                                                obj[prop][p] = "instanceof_"+con; //3-deep nested objects are cut off
                                            }  else {
                                                obj[prop][p] = value[prop][p]; 
                                            }
                                        } else {
                                            obj[prop][p] = value[prop][p]; 
                                        }
                                    }
                                }
                            }
                            else { 
                                let con = value[prop].constructor.name;
                                if (con.includes("Set")) {
                                    obj[prop] = Array.from(value[prop])
                                } else if(con !== "Number" && con !== "String" && con !== "Boolean") {
                                    obj[prop] = "instanceof_"+con;
                                } else {
                                    obj[prop] = value[prop]; 
                                }
                            }
                        }
                        //console.log(obj, value)
                        val = obj;
                        //refs.set(val, path.join('.'));
                    }
                    else {
                        val = value;
                    }
                } else {
                    val = value;
                }
            }
            //console.log(value, val)
            return val;
        }

        return function stringifyFast(obj, space) {
            try {
                parents.push(obj);
                return JSON.stringify(obj, checkValues, space);
            } catch(er) {
                console.error(obj, er);
            } finally {
                clear();
            } 
        }
    })();
}



if(JSON.stringifyWithCircularRefs === undefined) {
    //Workaround for objects containing DOM nodes, which can't be stringified with JSON. From: https://stackoverflow.com/questions/4816099/chrome-sendrequest-error-typeerror-converting-circular-structure-to-json
    JSON.stringifyWithCircularRefs = (function() {
        const refs = new Map();
        const parents = [];
        const path = ["this"];

        function clear() {
        refs.clear();
        parents.length = 0;
        path.length = 1;
        }

        function updateParents(key, value) {
        var idx = parents.length - 1;
        var prev = parents[idx];
        if (prev[key] === value || idx === 0) {
            path.push(key);
            parents.push(value);
        } else {
            while (idx-- >= 0) {
            prev = parents[idx];
            if (prev[key] === value) {
                idx += 2;
                parents.length = idx;
                path.length = idx;
                --idx;
                parents[idx] = value;
                path[idx] = key;
                break;
            }
            }
        }
        }

        function checkCircular(key, value) {
        if (value != null) {
            if (typeof value === "object") {
            if (key) { updateParents(key, value); }

            let other = refs.get(value);
            if (other) {
                return '[Circular Reference]' + other;
            } else {
                refs.set(value, path.join('.'));
            }
            }
        }
        return value;
        }

        return function stringifyWithCircularRefs(obj, space) {
        try {
            parents.push(obj);
            return JSON.stringify(obj, checkCircular, space);
        } finally {
            clear();
        }
        }
    })();
}

