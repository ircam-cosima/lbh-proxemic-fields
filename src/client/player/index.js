// import client side soundworks and player experience
import * as soundworks from 'soundworks/client';
import PlayerExperience from './PlayerExperience.js';
import viewTemplates from '../shared/viewTemplates';
import viewContent from '../shared/viewContent';

// list of files to load (passed to the experience)
const files = [

  'sounds/welcome-01.mp3',
  'sounds/welcome-02.mp3',
  // 'sounds/welcome-03.mp3',
  'sounds/welcome-04.mp3',
  // 'sounds/welcome-05.mp3',
  'sounds/welcome-06.mp3',
  // 'sounds/goodbye-01.mp3',
  'sounds/goodbye-02.mp3',
  // 'sounds/goodbye-03.mp3',
  'sounds/goodbye-04.mp3',
  'sounds/goodbye-05.mp3',
  'sounds/goodbye-06.mp3',

  'sounds/prox-bank-01-A.mp3',
  'sounds/prox-bank-01-B.mp3',
  'sounds/prox-bank-01-C.mp3',
  'sounds/prox-bank-02-A.mp3',
  'sounds/prox-bank-02-B.mp3',
  'sounds/prox-bank-02-C.mp3',
  'sounds/prox-bank-03-A.mp3',
  'sounds/prox-bank-03-B.mp3',
  'sounds/prox-bank-03-C.mp3',
  'sounds/prox-bank-04-A.mp3',
  'sounds/prox-bank-04-B.mp3',
  'sounds/prox-bank-04-C.mp3',

  'sounds/time-over.wav',

  'sounds/Error_nice.wav',
];

const routeMap = new Map();
const undefinedSoundId = files.length - 1; // debug error sound

for (let i = 0; i < 4; i++){
  routeMap.set('swipeDown_set'+i, i);
  routeMap.set('swipeUp_set'+i, i+4);
}

let i = 8;
// for only two banks:
// routeMap.set('sets', [ [i, i+1, i+2], [i+3, i+4, i+5], [i, i+1, i+2], [i+3, i+4, i+5] ] );
// for 4 banks:
routeMap.set('sets', [ [i, i+1, i+2], [i+3, i+4, i+5], [i+6, i+7, i+8], [i+9, i+10, i+11] ] );

routeMap.set('experienceOver', undefinedSoundId - 1 );


// launch application when document is fully loaded
window.addEventListener('load', () => {
  // configuration received from the server through the `index.html`
  // @see {~/src/server/index.js}
  // @see {~/html/default.ejs}
  const { appName, clientType, socketIO, assetsDomain }  = window.soundworksConfig;
  // initialize the 'player' client
  soundworks.client.init(clientType, { appName, socketIO });
  soundworks.client.setViewContentDefinitions(viewContent);
  soundworks.client.setViewTemplateDefinitions(viewTemplates);

  // create client side (player) experience
  const experience = new PlayerExperience(assetsDomain, files, routeMap);

  // start the client
  soundworks.client.start();
});
