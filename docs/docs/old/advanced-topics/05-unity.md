---
title: Integrating a Unity Project
hide_title: false
---

This Applet is intended to illustrate a 'hello world' type of interaction built between the Brains@Play webserver and a Unity build integrated into the Applet framework or standalone, so that anyone can build whatever they want in Unity and hook it up with their own version of this applet.

There are two parts to this. The web javascript side and the Unity c# side. You might come from a web or unity background or you might already be versed enough in both. Regardless I will describe the process from these two perspectives.


## Web JS
The example applet uses only some of the available BCI data that you can hook up to your implementation. You can find all of the meta and raw data functions available to you from the BCI processing layer in the DataAtlas.js. The data sent over is a stringified array of floats. You can find all of the meta and raw data functions available to you from the BCI processing layer in the DataAtlas.js.


## Unity
BCIReceiver implements a platform dependent interface that either listens to messages coming from the server or reads the socket that the server is sending the data to in the case of standalone windows build.

EEG data string gets chopped and assigned in the same order that the struct variables are declared. Be careful about implementing new data because of this. The Edata has to be ordered the same way on both the Unity and the Applet.

The receiver is the System GameObject to which you are sending the eeg data. Other game objects that you want to make bci-interactable can implement an interface and then check the latest eeg data on the listener whenever they need to.


## The Process
### Unity
1. Download the UnityBrainsAtPlayTemplate project.
2. Create your scene. Make sure that there is one game object in your scene that has the BCIReceiver on it.
3. Create your own objects and scripts and refer to the BCIReceiver instance for eeg data when you need to.
4. Feel free to create your own architectures the way you see fit as this is just an example.

### Applet
1. Copy the Unity Applet template.
2. Build your Unity project. (make sure the platform is set to webgl)
3. Copy over the Build and TemplateData folders from your build into the template.
4. Open the webbuild.loader.js file and make sure that the very top line 'function createUnityInstance' has the word 'export' in front of it. Then go to line 207 where canvas object is created. Some versions of Unity wont have the gl rendercontext object defined here, so right before the line that goes 'if (canvas) {...}', copy in this line: 'let gl, glVersion;'
5. Now open up the UnityApplet.js and go to the init() function, find where webbuild calls createUnityInstance(). In its' lambda call we start a DataUpdate() method which fetches all the eeg data from the Atlas and sends it over to your gameobject that has the BCIReceiver script on it.
6. In the SendMessage call, you have to make sure that the first parameter is the name of that game object ans not the script. And then the UpdateData method call is universal for your BCIReceiver. Unless you renamed it.


## Notes
* make sure the build is set to Development in the project build settings, otherwise the loader.js will get ultra optimized and you wont be able to edit it. This might be version specific, but just in case.


## Important for Chrome Users
Make sure that your hardware rendering is turned on under Settings > Advanced > System
Then Go to chrome://flags in your browser
Ensure that Disable WebGL is not activated