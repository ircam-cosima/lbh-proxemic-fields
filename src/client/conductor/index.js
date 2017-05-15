import * as soundworks from 'soundworks/client';
import serviceViews from '../shared/serviceViews';

function bootstrap() {
  // initialize the client with configuration received
  // from the server through the `index.html`
  // @see {~/src/server/index.js}
  // @see {~/html/default.ejs}
  const config = Object.assign({ appContainer: '#container' }, window.soundworksConfig);
  soundworks.client.init(config.clientType, config);

  // configure views for the services
  soundworks.client.setServiceInstanciationHook((id, instance) => {
    if (serviceViews.has(id))
      instance.view = serviceViews.get(id, config);
  });

  // configure appearance of shared parameters
  let defaultSliderSize = 'medium';
  const conductor = new soundworks.ControllerExperience({
    numPlayers: { readOnly: true },
    
    setLocPlayer0: { type: 'buttons' },
    resetRotPlayer0: { type: 'buttons' },
    invitePlayer0: { type: 'buttons' },
    killPlayer0: { type: 'buttons' },
    timerPlayer0: { readOnly: true },
    lineBreak0: { readOnly: true },

    setLocPlayer1: { type: 'buttons' },
    resetRotPlayer1: { type: 'buttons' },
    invitePlayer1: { type: 'buttons' },
    killPlayer1: { type: 'buttons' },
    timerPlayer1: { readOnly: true },
    lineBreak1: { readOnly: true },

    setLocPlayer2: { type: 'buttons' },
    resetRotPlayer2: { type: 'buttons' },
    invitePlayer2: { type: 'buttons' },
    killPlayer2: { type: 'buttons' },
    timerPlayer2: { readOnly: true },
    lineBreak2: { readOnly: true },

    setLocPlayer3: { type: 'buttons' },
    resetRotPlayer3: { type: 'buttons' },
    invitePlayer3: { type: 'buttons' },
    killPlayer3: { type: 'buttons' },
    timerPlayer3: { readOnly: true },
    lineBreak3: { readOnly: true },

    setLocPlayer4: { type: 'buttons' },
    resetRotPlayer4: { type: 'buttons' },
    invitePlayer4: { type: 'buttons' },
    killPlayer4: { type: 'buttons' },
    timerPlayer4: { readOnly: true },
    lineBreak4: { readOnly: true },

    setLocPlayer5: { type: 'buttons' },
    resetRotPlayer5: { type: 'buttons' },
    invitePlayer5: { type: 'buttons' },
    killPlayer5: { type: 'buttons' },
    timerPlayer5: { readOnly: true },    
    lineBreak5: { readOnly: true },    

    reload: { type: 'buttons' },
  });

  // start client
  soundworks.client.start();
}

window.addEventListener('load', bootstrap);
