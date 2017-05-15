import { Experience } from 'soundworks/server';

const locationNames = ['hall', 'studio'];
const numberOfSoundSets = 4;

// server-side 'player' experience.
export default class PlayerExperience extends Experience {
  constructor(clientType) {
    super(clientType);

    // services
    this.checkin = this.require('checkin');
    this.sharedConfig = this.require('shared-config');
    this.params = this.require('shared-params');
    this.osc = this.require('osc');
    this.sync = this.require('sync');
    this.audioBufferManager = this.require('audio-buffer-manager');

    // binding
    this.gestureCallback = this.gestureCallback.bind(this);
    this.updateClientLocationId = this.updateClientLocationId.bind(this);
    this.updateSoundId = this.updateSoundId.bind(this);

    // local attributes
    this.playerMap = new Map();
    this.playerTimerMap = new Map();
    this.oscIdRouteMap = new Map(); // 2 available OSC channels for data
    this.maxNumPlayers = this.sharedConfig.get('setup.capacity');

    // listen to shared parameter changes
    for (let i = 0; i < this.maxNumPlayers; i++) { 
      this.params.addParamListener('setLocPlayer'+i, (value) => {
        this.updateClientLocationId(i, value);
      });
    }
  }

  // if anything needs to append when the experience starts
  start() {
    // send update msg to OSC client (e.g. if connected after some of the players / conductor)
    this.osc.receive('/updateRequest', (values) => {
      // this.playerMap.forEach((item, key) => {
      //   // this.osc.send('/player', [item.client.index, 'soundId', item.soundId]);
      //   // this.osc.send('/player', [item.client.index, 'enterExit', item.locationId]);
      //   this.sendOsc( item.client.index, [ 'soundId', item.soundId] );
      //   this.sendOsc( item.client.index, [ 'enterExit', item.locationId] );
      // });      
      
    });

    // sync. OSc client clock with server's (delayed in setTimeout for now because OSC not init at start.)
    setTimeout( () => {
      const clockInterval = 0.1; // refresh interval in seconds
      setInterval(() => { this.osc.send('/clock', this.sync.getSyncTime()); }, 1000 * clockInterval);
    }, 1000);  
  }

  // if anything needs to happen when a client enters the performance
  enter(client) {
    super.enter(client);

    // find available soundId, add to local map + update distant
    // get list of all sounds id
    // let availableSoundIds = [];
    // for (let i = 0; i < numberOfSoundSets; i++) { availableSoundIds.push(i) };
    // remove sounds id already occupied
    // this.playerMap.forEach((item, key) => {
    //   availableSoundIds.splice( availableSoundIds.indexOf( item.soundId ), 1 );
    // });
    // get random sound id from remaining list
    // let soundId = availableSoundIds[ Math.round(Math.random() * (availableSoundIds.length-1)) ];
    let soundId = Math.round(Math.random() * (numberOfSoundSets-1));

    // update local
    this.playerMap.set(client.index, { client: client, soundId: soundId, locationId: 0 }); // locationId 0: hall, 1: studio 4
    // update players
    this.broadcast('player', null, 'soundId', client.index, soundId );
    // update OSC client
    // this.sendOsc(client.index, [ 'soundId', soundId ]);
    // this.osc.send('/player', [client.index, 'soundId', soundId]);

    // update shared param
    this.params.update('numPlayers', this.playerMap.size);
    this.params.update('setLocPlayer' + client.index, 'hall');

    // direct forward from soundworks client to OSC client
    this.receive(client, 'directToOSC', (data) => { this.directToOSC(data) });

    // gesture callback
    this.receive(client, 'gesture', this.gestureCallback);

    // panning callback (used for panning between sounds in soundscape)
    this.receive(client, 'ballPos', (value) => { this.broadcast('player', client, 'ballPos', client.index, value ); });

  }

  directToOSC(data) {
    let playerId = data.shift();
    this.sendOsc(playerId, data);
  }

  // redefine ID (limited number of available poly~ in MaxMSP)
  sendOsc(playerId, data){
    // get OSC ID
    let oscId = this.oscIdRouteMap.get(playerId);
    // get new OSC ID
    if( oscId === undefined ){
      // table already full (max 2 players in OSC), discard
      if( this.oscIdRouteMap.size >= 2 ){ return; }
      // get array of currently occupied indices
      let indexArray = Array.from( this.oscIdRouteMap ).map( (x) => { return x[1]; } );
      // get new player OSC ID
      let newOscId = -1;
      for( let i = 0; i < 2; i++ ){
        if( indexArray.indexOf(i) == -1 ){ 
          newOscId = i; 
          break;
        }
      }
      // just in case no index found (should not happend)
      if( newOscId === -1 ){ return; }
      // assign to memory
      this.oscIdRouteMap.set( playerId, newOscId );
      oscId = newOscId;
    }
    // send msg with new Id
    data.unshift( oscId );
    this.osc.send('/player', data);
  }

  exit(client) {
    super.exit(client);

    // update players
    this.broadcast('player', null, 'soundId', client.index, -1 );

    // stop sound source in OSC client associated with current soundworks client
    // this.osc.send('/player', [client.index, 'enterExit', 0]);
    this.sendOsc(client.index, [ 'enterExit', 0 ] );

    // remove from local map 
    this.playerMap.delete(client.index);
    this.oscIdRouteMap.delete(client.index);
    
    // update shared param
    this.params.update('numPlayers', this.playerMap.size);
    this.params.update('player' + client.index, 'none');
    
    // kill timer
    let timer = this.playerTimerMap.get(client.index);
    if( timer !== undefined ){ 
      clearInterval(timer.callback); // kill callback
      this.params.update('timerPlayer' + client.index, 0); // update visual
      this.playerTimerMap.delete(client.index);
    }

  }

  updateClientLocationId(clientId, locName){
    // get player
    let player = this.playerMap.get(clientId);
    // discard if undefined
    if (player === undefined ){ return; }
    // convert loc name to loc id
    let locId = locationNames.indexOf(locName);
    // if location is not -1 (none)
    if( locId >= 0 ){
      // notify OSC client is leaving studio if it was in studio
      if( player.locationId === 1 && locId === 0 ){ this.sendOsc(player.client.index, ['enterExit', locId] ); }
      // update local / send player new loc id
      player.locationId = locId;
      this.send(player.client, 'locationId', player.locationId);
      // notify OSC client to start / stop player sound (locId and enterExit value match here)
      // this.osc.send('/player', [player.client.index, 'enterExit', locId]);
      if( locId === 1){ this.sendOsc(player.client.index, ['enterExit', locId] ); }
      // clear osc id if client leaves studio
      if( locId === 0 ){ this.oscIdRouteMap.delete(clientId); }
      // setup timer to keep track on how long player has been in given location
      let timer = this.playerTimerMap.get(clientId);
      if( timer !== undefined ){ 
        // clear previous interval
        clearInterval(timer.callback); 
        // init timer
        timer.time = 0.0;
      }
      else{
        timer = {time:0, callback:undefined};
        this.playerTimerMap.set(clientId, timer); // reset timer
      }
      // start timer
      timer.callback = setInterval( () => {
        let timer = this.playerTimerMap.get(clientId);
        timer.time += 1.0; // incr. timer
        this.params.update('timerPlayer' + clientId, timer.time); // update visual
      }, 1000);
    }
  }

  updateSoundId(clientId, newSoundId){
    // get player
    let player = this.playerMap.get(clientId);
    
    // // give my current sound to player currently using the sound I'll have
    // this.playerMap.forEach((item, key) => {
    //   if( item.soundId == newSoundId ){
    //     // set local
    //     item.soundId = player.soundId;
    //     // update player
    //     // this.send(item.client, 'soundId', item.soundId);
    //     this.broadcast('player', null, 'soundId', item.client.index, item.soundId );
    //     // update OSC client
    //     this.sendOsc(item.client.index, ['soundId', item.soundId] );
    //     // this.osc.send('/player', [item.client.index, 'soundId', item.soundId]);
    //   }
    // });

    // update player
    // console.log('discared by player', player.client.index, 'soundId', player.soundId);
    // this.send(player.client, 'soundId', newSoundId);
    this.broadcast('player', null, 'soundId', player.client.index, newSoundId );
    player.soundId = newSoundId;
    // update OSC client
    // this.osc.send('/player', [player.client.index, 'soundId', player.soundId]);    
    if( player.locationId === 1) { this.sendOsc(player.client.index, [ 'soundId', player.soundId] ); }
  }

  gestureCallback(senderId, gestureType) {
    // console.log(senderId, gestureType);

    // get player associated with senderId
    let player = this.playerMap.get(senderId);

    switch (gestureType) {
      case 'swipeUp': 

        // change sound with another player
        // if( player.locationId == 0 ){
          
          // // find available sound indices (e.g. not the ones of players already in ambisonic location)
          // // get list of all sound indices
          // let availableSoundIds = [];
          // const numberOfSoundSets = 4;
          // for (let i = 0; i < numberOfSoundSets; i++) { availableSoundIds.push(i) };
          // // remove my index from availables
          // availableSoundIds.splice(availableSoundIds.indexOf(player.soundId), 1);
          // // remove index of players in Ambisonic location
          // this.playerMap.forEach((item, key) => {
          //   if( item.locationId == 1 ) 
          //     availableSoundIds.splice(availableSoundIds.indexOf(item.soundId), 1);
          // });
          
          // // notify player if there's no possible change 
          // if( availableSoundIds.length == 0 ){  
          //   this.send(player.client, 'soundId', player.client.index, -1);
          // }
          
          // // take sound id change into account
          // else{
          //   // get random new sound Id from availables
          //   let newSoundId = availableSoundIds[ Math.round(Math.random() * (availableSoundIds.length-1)) ];
          //   // update sound id
          //   this.updateSoundId( player.client.index, newSoundId );
          // }


        // get next sound set
        let newSoundId = (player.soundId + 1) % numberOfSoundSets;
        // update sound id
        this.updateSoundId( player.client.index, newSoundId );          
        // this.osc.send('/player', [senderId, 'swipeUp']);
        if( player.locationId === 1) { this.sendOsc(senderId, [ 'swipeUp' ] ); }
          
        // }
        // else{ // notify OSC client
        //   this.osc.send('/player', [senderId, 'swipeUp']);
        // }

        break;

      case 'swipeDown':
        if( player.locationId == 1 ){
          // this.osc.send('/player', [senderId, 'swipeDown']);
          this.sendOsc(senderId, [ 'swipeDown' ] );
        }
        break;
    }
  }

}







