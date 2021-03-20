class dataServer { //Just some working concepts for handling data sockets serverside
	constructor(appnames=[]) {
		this.userData=new Map();
		this.serverInstances=appnames;
		this.userSubscriptions=[];
		this.gameSubscriptions=[];
        this.subUpdateInterval = 100; //ms
	}

	addUser(username='',appname='',socket=null,availableProps=[]) {

        socket = this.setWSBehavior(username, socket)
        
        if (!this.userData.has(username)){
            this.userData.set(username, {
                username:username,
                appname:appname,
                socket:socket,
                props: {},
                lastUpdate:Date.now(),
                lastTransmit:0,
                latency:0
            })
            availableProps.forEach((prop,i) => {
                this.userData.get(username).props[prop] = '';
            });
        }
    }

    getUserData(username='') {
        return this.userData.get(username);
    }
    
    setWSBehavior(username, socket){
        if (socket != null){
            socket.on('message', (s) => {
                this.processMessage(s);
            });

            socket.on('close', (s) => {
                this.removeUser(username)
            });
        }
        return socket
    }

    removeUser(username='username') {
        this.userData.delete(username)
    }

    removeUserToUserStream(listener,source,propnames=null) { //delete stream or just particular props
        let found = false;
        let sub = this.userSubscriptions.find((o,i)=>{
            if(o.listener === listener && o.source === source) {
                if(!Array.isArray(propnames)) this.userSubscriptions.splice(i,1);
                else {
                    propnames.forEach((prop) => {
                        let pidx = o.propnames.indexOf(prop);
                        if(pidx > -1) {
                            o.propnames.splice(pidx);
                        }
                    })
                }
                found = true;
                return true;
            }
        });
        return found;
    }

    removeUserFromGame(appname='',username='') {
        let found = false;
        let sub = this.gameSubscriptions.find((o,i) => {
            if(o.appname === appname) {
                let uidx = o.usernames.indexOf(username);
                if(uidx > -1) o.usernames.splice(uidx,1);
                let sidx = o.spectators.indexOf(username);
                if(sidx > -1) o.spectators.splice(sidx,1);
                found = true;
                return true;
            }
        });
        return found;
    }

    removeGameStream(appname='') {
        let found = false;
        let sub = this.gameSubscriptions.find((o,i) => {
            if(o.appname === appname) {
                this.gameSubscriptions.splice(i,1);
                found = true;
                return true;
            }
        });
        return found;
    }

    processMessage(msg='') {
        let parsed = JSON.parse(msg);
        if(typeof parsed === 'object' && !Array.isArray(parsed)) { //if we got an object process it as most likely user data
            this.updateUserData(parsed);
        }
        else if (Array.isArray(parsed)) { //handle commands sent as arrays [username,cmd,arg1,arg2]
            this.processUserCommand(parsed[0],[...parsed.shift()]);  
        }
        else if (typeof parsed === 'string') { //handle string commands with spaces, 'username command arg1 arg2'
            let cmd = parsed.split(' ');
            this.processUserCommand(cmd[0],[...cmd.shift()]);
        }
    }

    
    processUserCommand(username='',command=[]) { //Commands should be an array of arguments 
        let u = this.userData.get(username);
        
        if(command[0] === 'getUsers') {
            let users = [];
            this.userData.forEach((name,o) => {
                if(command[1] !== undefined) {
                    if(o.appname === command[1]) {
                        users.push(o);
                    }
                }
                else if(o.appname === u.appname) {
                    users.push(o.username);
                }
            });
            if(users.length > 0) u.socket.send(JSON.stringify({msg:'getUsersResult', userData:users}))
            else u.socket.send(JSON.stringify({msg:'userNotFound', userData:[username]}))
        }
        else if(command[0] === 'getUserData') {
            if(command[2] === undefined) {
                let u2 = this.getUserData(command[1]);
                u.socket.send(JSON.stringify({msg:'getUserDataResult',username:command[1],props:u2.props}));
            }
            else if (Array.isArray(command[2])) {
                let d = this.getUserData(command[1]).props;
                let result = {msg:'getUserDataResult',username:command[1],props:{}};
                command[2].forEach((prop)=> {update[props][prop] = d.props[prop]});
                u.socket.send(JSON.stringify(result));
            }
        }
        else if (command[0] === 'createGame') {
            this.createGameSubscription(command[1],command[2],command[3]);
        }
        else if (command[0] === 'getGameInfo') {
            let sub = this.getGameSubscription(command[1]);
            if(sub === undefined) {
                u.socket.send(JSON.stringify({msg:'gameNotFound',appname:command[1]}));
            }
            else {
                u.socket.send(JSON.stringify({msg:'getGameInfoResult',appname:command[1],gameInfo:sub}));
            }
        }
        else if (command[0] === 'getGameData') {
            let gameData = this.getGameData(command[1]);
            if(gameData === undefined) {
                u.socket.send(JSON.stringify({msg:'gameNotFound',appname:command[1]}));
            }
            else {
                u.socket.send(JSON.stringify({msg:'getGameDataResult',appname:command[1],gameData:gameData}));
            }
        }
        else if(command[0] === 'subscribeToUser') {
            this.streamBetweenUsers(username,command[1],command[2]);
        }
        else if(command[0] === 'subscribeToGame') {
            this.subscribeUserToGame(username,command[1],command[2]);
        }
        else if(command[0] === 'unsubscribeFromUser') {
            let found = this.removeUserToUserStream(username,command[1],command[2]);
            if(found) {  u.socket.send(JSON.stringify({msg:'unsubscribed',username:command[1],props:command[2]}));}
            else { u.socket.send(JSON.stringify({msg:'userNotFound'}));}
        } 
        else if(command[0] === 'leaveGame') {
            let found = this.removeUserFromGame(command[1],u.username);
            if(found) {  u.socket.send(JSON.stringify({msg:'leftGame',appname:command[1]}));}
            else { u.socket.send(JSON.stringify({msg:'gameNotFound'}));}
        }
        else if(command[0] === 'deleteGame') {
            let found = this.removeGameStream(command[1]);
            if(found) { u.socket.send(JSON.stringify({msg:'gameDeleted',appname:command[1]}));}
            else { u.socket.send(JSON.stringify({msg:'gameNotFound'}));}
        }
        else if( command[0] === 'ping' || command === 'ping') {
            u.socket.send(JSON.stringify({msg:'pong'}))
        }
    }

	//Received a message from a user socket, now parse it into system
	updateUserData(data={msg:'',username:'',prop1:[],prop2:[]}){ 

		//Send previous data off to storage
        if (this.userData.has(data.username)){
            let hasData = false;
            for(const prop in data) {
                if(prop !== 'msg' && prop !== 'username') {
                    hasData = true;
                }
            }

            if(!hasData && data.username && data.msg) {
                this.processUserCommand(data.username,data.msg);
            }
            else {
                let o = this.userData.get(data.username)
                for(const prop in data) {
                    if(prop !== 'msg' && prop !== 'username') o.props[prop] = data[prop];
                }
                let now = performance.now();
                o.latency = now-o.lastUpdate;
                o.lastUpdate = Date.now();

                this.userSubscriptions.forEach((o,i) => {
                    if(o.source === data.username) {
                        o.newData = true;
                    }
                });
            }
        }
	}

	streamBetweenUsers(listenerUser,sourceUser,propnames=[]) {
        let sub = this.userSubscriptions.find((o,i) => {
            if(o.listener === listenerUser && o.source === sourceUser) {
                o.propnames = propnames;
            }
        });
        if(sub === undefined) {
            if(this.userData.get(listenerUser) !== undefined && this.userData.get(sourceUser) !== undefined) {
                this.userSubscriptions.push({
                    listener:listenerUser,
                    source:sourceUser,
                    propnames:propnames,
                    newData:false
                });
                this.userData.get(listenerUser).socket.send(JSON.stringify({msg:'subscribedToUser', sub:this.userSubscriptions[this.userSubscriptons.length-1]}))
            }
            else {
                this.userData.get(listenerUser).socket.send(JSON.stringify({msg:'userNotFound'}))
            }
           
        }
	}

	createGameSubscription(appname='',devices=[],propnames=[]) {
		this.gameSubscriptions.push({
			appname:appname,
            devices:devices,
            usernames:[],
            spectators:[], //usernames of spectators
			propnames:propnames,
            lastTransmit:Date.now()
		});
	}

	getGameSubscription(appname='') {
		let g = this.gameSubscriptions.find((o,i) => {
			if(o.appname === appname) {
				return true;
			}
		});
		return g;
	}

    getGameData(appname='') {
        let gameData = undefined;
        let s = this.gameSubscriptions.find((sub,i) => {
            if(sub.appname === appname) {
                let updateObj = {
                    msg:'gameData',
                    appname:sub.appname,
                    devices:sub.devices,
                    userData:[],
                    spectators:[]
                };
                
                sub.usernames.forEach((user,j) => {
                    if(sub.spectators.indexOf(user) < -1){
                        let userObj = {
                            username:user
                        }
                        let listener = this.userData.get(user);
                        sub.propnames.forEach((prop,k) => {
                            userObj[prop] = listener.props[prop];
                        });
                        updateObj.userData.push(userObj);
                    }
                    else {
                        spectators.push(user);
                    }
                });
                gameData = updateObj;
                return true;
            }
        });
        return gameData;
    }

	subscribeUserToGame(username,appname,spectating=false) {
		let g = this.getGameSubscription(appname);
        let u = this.userData.get(username);
		if(g !== undefined && u !== undefined) {
			g.usernames.push(username);
            if(spectating === true) g.spectators.push(username);
			
			g.propnames.forEach((prop,j) => {
				if(!(prop in u.props)) u.props[prop] = '';
			});
			//Now send to the user which props are expected from their client to the server on successful subscription
			u.socket.send(JSON.stringify({msg:'subscribedToGame',appname:appname,propnames:g.propnames}));
		}
		else {
			u.socket.send(JSON.stringify({msg:'gameNotFound',appname:appname}));
		}
	}

	subscriptionLoop = () => {
        let time = Date.now();
        //Should have delay interval checks for each subscription update for rate limiting
		this.userSubscriptions.forEach((sub,i) => {
            //Should create a dispatcher that accumulates all subscription data to push all concurrent data in one message per listening user
            if(sub.lastTransmit - time > this.subUpdateInterval){
                let listener = this.userData.get(sub.listener);
                let source = this.userData.get(sub.source);

                if(sub.newData === true){
                    let dataToSend = {
                        msg:'userData',
                        username:source.username
                    };
                    sub.propnames.forEach((prop,j) => {
                        dataToSend[prop] = source.props[prop];
                    });
                    listener.get('user').socket.send(JSON.stringify(dataToSend));
                    sub.newData = false;
                    sub.lastTransmit = time;
                }
            }
		});

		this.gameSubscriptions.forEach((sub,i) => {
            if(sub.lastTransmit - time > this.subUpdateInterval){
                let updateObj = {
                    msg:'gameData',
                    appname:sub.appname,
                    devices:sub.devices,
                    userData:[],
                    spectators:[]
                };
                
                sub.usernames.forEach((user,j) => {
                    if(sub.spectators.indexOf(user) < -1){
                        let userObj = {
                            username:user
                        }
                        let listener = this.userData.get(user);
                        sub.propnames.forEach((prop,k) => {
                            userObj[prop] = listener.props[prop];
                        });
                        updateObj.userData.push(userObj);
                    }
                    else {
                        spectators.push(user);
                    }
                });

                sub.userNames.forEach((user,j) => {
                    user.socket.send(JSON.stringify(updateObj));
                });
            }
            sub.lastTransmit = time;
		});

		setTimeout(() => {this.subscriptionLoop()},10);
	}

}

module.exports = dataServer