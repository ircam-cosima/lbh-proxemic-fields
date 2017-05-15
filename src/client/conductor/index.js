import * as soundworks from 'soundworks/client';
import viewTemplates from '../shared/viewTemplates';
import viewContent from '../shared/viewContent';

window.addEventListener('load', () => {
  // configuration received from the server through the `index.html`
  // @see {~/src/server/index.js}
  // @see {~/html/default.ejs}
  const { appName, clientType, socketIO }  = window.soundworksConfig;
  // initialize the 'player' client
  soundworks.client.init(clientType, { socketIO, appName });
  soundworks.client.setViewContentDefinitions(viewContent);
  soundworks.client.setViewTemplateDefinitions(viewTemplates);

  // configure appearance of shared parameters
  let defaultSliderSize = 'medium';
  const conductor = new soundworks.BasicSharedController({
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
});
