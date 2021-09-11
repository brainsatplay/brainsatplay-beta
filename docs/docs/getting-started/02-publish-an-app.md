---
title: Publish your First Application
hide_title: false
---

<!-- ![Your First Applet](../../static/img/02-your-first-applet/header.png) -->

<!-- ## Overview
--- -->
Now that we're a bit further along, it's time to understand the publishing workflow for a Brains@Play application.

## Sections
1. Publish and Manage your App to B@P (video)
2. Download and Distribute Elsewhere (video)


## Application Architecture
---
Brains@Play applications are written as Javascript dictionaries contained in a `settings.js` file. This file contains the essential information to assemble your application, including **metadata** and **graphs**.

### Applet Folder
The `applet` folder contains a `settings.js` file and `UI.js` file. These define the logic and style of your application.

#### UI.js 
The `UI.js` file contains an **output** plugin. These are usually located at the end of your application graph and display results to your user.

#### settings.js
The `settings.js` file contains the required information to assemble your application.
 
```javascript
import { UI } from './UI.js'

export const settings = {

  // App Metadata
  name: "My First Applet", // The name of your applet
  devices: ["EEG"], // Compatible devices for your applet
  intro: {
    mode: 'single' // The default intro sequence for your application. Leave blank for no intro.
  },

  // App Logic
  graph:
    {
    nodes: [
      {id: 'signal', class: brainsatplay.plugins.Signal, loop: true}, // A default node from Brains@Play that grabs session data

      {id: 'neurofeedback', class: brainsatplay.plugins.Neurofeedback, params: {}}, // A default node from Brains@Play to process session data into neurofeedback outputs

      {id: 'ui', class: UI, params: {}} // A user-defined node for displaying neurofeedback results
    ],
    edges: [
      {
        source: 'signal', // Grab session data
        target: 'neurofeedback' // Convert to the selected neurofeedback output
      },
      {
        source: 'neurofeedback', // Grab the selected neurofeedback output
        target: 'ui' // Display to the user
      }
    ]
  },
}

```

## Try It Out!
Now that you understand the starter applet, open the `index.html` to view the neurofeedback application.

## Conclusion
Congratulations on creating your first application with Brains@Play! 

Of course, there's much more that can be done with our framework—but we hope this has inspired you to dive deeper into the growing field of neurotechnology and begin developing fully-featured applications. 

To get the specific data required by your application, head over to the [**Reference**](../reference) page of our documentation. We're so excited to experience what you dream up!
