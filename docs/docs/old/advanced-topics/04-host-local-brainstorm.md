---
title: Host a Local Brainstorm
hide_title: false
---

<!-- ## Overview
--- -->
This tutorial will guide you through setting up a local Brainstorm to play multiplayer games.


## Create Local Development Environment
---
### Clone our Github Repository
Clone the [brainsatplay](https://github.com/brainsatplay/brainsatplay) repository from Github.

### Install Required Packages
Navigate to the root directory of the repository and run `npm install` in your terminal.

### Run the Development Server
Run `npm start` in your terminal to build and start a development server. If everything is working properly, a local version of The Brains@Play Platform should open at https://localhost:1234.

## Create a Valid SSL Certificate
---
Follow [this walkthrough](https://www.freecodecamp.org/news/how-to-get-https-working-on-your-local-development-environment-in-5-minutes-7af615770eec/) on creating a local certificate (`snowpack.crt` and `snowpack.key`) to pass to our local development server. You should replace the provided certificates with those that you've validated on your local computer.

After this, you can run `npm start` in the terminal again.

## Conclusion
---
If your certificates have been configured properly, you should now have a secure instance of The Brains@Play Platform running in your local environment. Other computers on your Local Area Network (LAN) may now connect to your local IP address that is logged in the terminal and Chrome Developer Console (e.g. https://10.0.0.3:1234 for browser window, https://10.0.0.3 for establishing the WebSocket connection on login). 

Now their data will be accessible to anyone else connected to your local Brainstorm!