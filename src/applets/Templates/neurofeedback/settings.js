
import * as brainsatplay from '../../../libraries/js/brainsatplay'
import {Parser} from './Parser'

export const settings = {
    name: "Neurofeedback Template",
    devices: ["EEG"],
    author: "Garrett Flynn",
    description: "Get started building a neurofeedback app!",
    categories: ["learn"],
    instructions:"Coming soon...",
    display: {
      production: false,
      development: true
    },

    intro: {
      title:false
    },

    // App Logic
    graph:
    {
      nodes: [
        {id: 'eeg', class: brainsatplay.plugins.biosignals.EEG},
        {id: 'neurofeedback', class: brainsatplay.plugins.algorithms.Neurofeedback, params: {}},
        {id: 'brainstorm', class: brainsatplay.plugins.networking.Brainstorm, params: {

          onUserConnected: (u) => {
            let parser = settings.graph.nodes.find(n => n.id === 'parser')
            parser.instance._userAdded(u)
          },
      
          onUserDisconnected: (u) => {
            let parser = settings.graph.nodes.find(n => n.id === 'parser')
            parser.instance._userRemoved(u)
          },

        }},
        {id: 'parser', class: Parser, params: {}},
        {id: 'ui', class: brainsatplay.plugins.interfaces.UI, params: {
          style: `
          .brainsatplay-ui-container {
            width: 100%;
            height: 100%;
          }

          #content {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          `
        }},
      ],

      edges: [
        {
          source: 'eeg:atlas', 
          target: 'neurofeedback'
        },
        { 
          source: 'neurofeedback', 
          target: 'brainstorm'
        },
        {
          source: 'brainstorm:neurofeedback', 
          target: 'parser'
        },
        {
          source: 'parser:element', 
          target: 'ui:content'
        },
      ]
    },
}