import * as brainsatplay from '../../../libraries/js/brainsatplay'
import{Ramchurn} from './Ramchurn'


export const settings = {
    name: "NeuroCinema",
    devices: ["EEG", "HEG"],
    author: "Brains@Play",
    description: "Cut movies together based on brain data",
    categories: ["WIP"],
    instructions: "",
    display: {
      production: true,
      development: true
    },
    // App Logic
    graph:
    {
      nodes: [ 

        // Manual Control
        {id:'event', class: brainsatplay.plugins.controls.Event, params: {keycode: 'Space'}},

        // Data-Based Controls
        {id:'eeg', class: brainsatplay.plugins.biosignals.EEG},
        {id:'neurofeedback', class: brainsatplay.plugins.algorithms.Neurofeedback, metric: 'Focus'},

        {id:'buffer', class: brainsatplay.plugins.transforms.Buffer},
        {id:'arithmetic', class: brainsatplay.plugins.transforms.Arithmetic},

        {id:'peakDetector', class: brainsatplay.plugins.transforms.Peak},

        // File Manager
        {id:'manager', class: Ramchurn},

        // Video Player
        {id:'video', class: brainsatplay.plugins.interfaces.Video, params: {cut: true}},

        // Audio
        {id:'audio', class: brainsatplay.plugins.audio.Audio},

        // UI
        {id:'ui', class: brainsatplay.plugins.interfaces.UI, params: {
          html: `<div id="vidContainer" class="video-container"></div>`,
          style: `
          .brainsatplay-ui-container {
            width: 100%;
            height: 100%;
          }
          
          .video-container {
            width: 100%;
            height: 100%;
          }
          `
        }}

      ],
      edges: [

        // Insert Video Player to UI
        {
          source: 'video:element',
          target: 'ui:vidContainer'
        },

        // Pass Videos
        {
          source: 'manager:video',
          target: 'video:files'
        },

        // Pass Audio
        {
          source: 'manager:audio',
          target: 'audio:files'
        },

        // Data-Based Control
        {
          source: 'eeg:atlas',
          target: 'neurofeedback'
        },
        {
          source: 'neurofeedback',
          target: 'buffer'
        },
        {
          source: 'buffer',
          target: 'arithmetic:input'
        },
        {
          source: 'arithmetic:mean',
          target: 'peakDetector'
        },
        {
          source: 'peakDetector',
          target: 'event'
        },


        // Manual Control
        {
          source: 'event',
          target: 'manager:cut'
        },

        // Event Routing
        {
          source: 'manager:cut',
          target: 'video:change'
        },
        {
          source: 'manager:cut',
          target: 'audio:change'
        },
      ]
    },

    // graph: {
    //   nodes: [
    //     {id:'eeg', class: brainsatplay.plugins.biosignals.EEG},
    //     {id:'neurofeedback', class: brainsatplay.plugins.algorithms.Neurofeedback, metric: 'Focus'},

    //     {id:'buffer', class: brainsatplay.plugins.transforms.Buffer},
    //     {id:'arithmetic', class: brainsatplay.plugins.transforms.Arithmetic},

    //     {id:'peakDetector', class: brainsatplay.plugins.transforms.Peak},

    //     {id:'changeView', class: brainsatplay.plugins.controls.Event, params: {keycode: 'Space'}},
    //     {id:'player', class: brainsatplay.plugins.interfaces.Video, params: {
    //       cut: true,
    //       ramchurn: true
    //     }},
    //     {id:'ui', class: brainsatplay.plugins.interfaces.UI, params: {
    //       html: `<div id="vidContainer" class="video-container"></div>`,
    //       style: `
    //       .brainsatplay-ui-container {
    //         width: 100%;
    //         height: 100%;
    //       }
          
    //       .video-container {
    //         width: 100%;
    //         height: 100%;
    //       }
    //       `
    //     }}

    //   ],
    //   edges: [
    //     // Insert Video Player to UI
    //     {
    //       source: 'player:element',
    //       target: 'ui:vidContainer'
    //     },

    //     // Neurofeedback Controls
    //     {
    //       source: 'eeg:atlas',
    //       target: 'neurofeedback'
    //     },
    //     {
    //       source: 'neurofeedback',
    //       target: 'buffer'
    //     },
    //     {
    //       source: 'buffer',
    //       target: 'arithmetic:input'
    //     },
    //     {
    //       source: 'arithmetic:mean',
    //       target: 'peakDetector'
    //     },
    //     {
    //       source: 'peakDetector',
    //       target: 'changeView'
    //     },


    //     // Manual Controls
    //     {
    //     source: 'changeView',
    //     target: 'player:change'
    //   }
    // ]
    // },
}