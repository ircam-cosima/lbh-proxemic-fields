import 'source-map-support/register'; // enable sourcemaps in node
import * as soundworks from 'soundworks/server';
import PlayerExperience from './PlayerExperience';
import defaultConfig from './config/default';

let config = null;

switch(process.env.ENV) {
  default:
    config = defaultConfig;
    break;
}

// configure express environment ('production' enables cache systems)
process.env.NODE_ENV = config.env;
// initialize application with configuration options
soundworks.server.init(config);

// define parameters shared by different clients
const sharedParams = soundworks.server.require('shared-params');
const sharedConfig = soundworks.server.require('shared-config');
sharedParams.addText('numPlayers', 'num players', 0, ['conductor']);
for (let i = 0; i < sharedConfig.get('setup.capacity'); i++) { 
  // set location
  sharedParams.addEnum('setLocPlayer' + i, 'loc. player ' + i, ['none', 'hall', 'studio'], 'none');
  // reset orientation
  sharedParams.addTrigger('resetRotPlayer' + i, 'Reset Orientation player ' + i);
  // send sound to invite player in studio 1
  sharedParams.addTrigger('invitePlayer' + i, 'Invite player ' + i + ' in studio');  
  // lame line break
  sharedParams.addText('timerPlayer'+i, 'time (sec) since player ' + i + ' in current loc:', '', null);
  // force player out of experiment
  sharedParams.addTrigger('killPlayer' + i, 'Kill player ' + i);    
  // linebreak
  sharedParams.addText('lineBreak' + i, '', '', null);    
};

// sharedParams.addTrigger('playSound1', 'play instruction sound 1');
// sharedParams.addTrigger('playSound2', 'play instruction sound 2');

sharedParams.addTrigger('reload', 'Reload players');

// define the configuration object to be passed to the `.ejs` template
soundworks.server.setClientConfigDefinition((clientType, config, httpRequest) => {
  return {
    clientType: clientType,
    env: config.env,
    appName: config.appName,
    socketIO: config.socketIO,
    version: config.version,
    defaultType: config.defaultClient,
    assetsDomain: config.assetsDomain,
  };
});

// create server side conductor experience
const conductor = new soundworks.BasicSharedController('conductor');


// create the experience
// activities must be mapped to client types:
// - the `'player'` clients (who take part in the scenario by connecting to the
//   server through the root url) need to communicate with the `checkin` (see
// `src/server/playerExperience.js`) and the server side `playerExperience`.
// - we could also map activities to additional client types (thus defining a
//   route (url) of the following form: `/${clientType}`)
const experience = new PlayerExperience('player');

// start application
soundworks.server.start();
