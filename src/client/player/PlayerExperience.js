import * as soundworks from 'soundworks/client';
import PlayerRenderer from './PlayerRenderer';
import * as Audio from './SpatSyncSourceHandler';
import './fulltilt';

const audioContext = soundworks.audioContext;
const client = soundworks.client;
const SWIPE_LVL = 0.4;

const colorList = [ '#14435b', '#e7d174', '#b0d0b2', '#f79b2e', '#a9b8c1' ];
const bkgColorList = [ '#e54444', '#798edd', '#fdd75f', '#c2752d'];
const fadeInOutDuration = 3.0;

const viewTemplate = `
  <canvas class="background"></canvas>
  <div class="foreground">
    <div class="huger section-top flex-center"> 
      <p class="huger" id="clientId" align="center"> <%= clientID %> </p> 
    </div>
    <div class="section-center flex-center">
      <!--
      <p id="value0" class="big"><%= '' %></p>
      <p id="value1" class="big"><%= '' %></p>
      <p id="value2" class="big"><%= '' %></p>
      -->
      <p class="small soft-blink" id="title"></p>
    </div>
    <div class="section-bottom flex-center">
    </div>
  </div>
`;

const model = { clientID: client.index };

// this experience plays a sound when it starts, and plays another sound when
// other clients join the experience
export default class PlayerExperience extends soundworks.Experience {
  constructor(assetsDomain, audioFiles, bufferRouteMap) {
    super();

    // services
    this.platform = this.require('platform', { features: ['web-audio', 'wake-lock'] });
    this.checkin = this.require('checkin', { showDialog: false });
    this.sync = this.require('sync');
    this.params = this.require('shared-params');
    this.motionInput = this.require('motion-input', { descriptors: ['accelerationIncludingGravity', 'deviceorientation'] });
    this.language = this.require('language', {options: {en: 'English', fr:'Français'} });
    this.loader = this.require('audio-buffer-manager', {
      files: audioFiles,
      assetsDomain: assetsDomain,
    });

    // binding
    this.initTouch = this.initTouch.bind(this);
    this.touchGestureDetect = this.touchGestureDetect.bind(this);
    this.initMotion = this.initMotion.bind(this);
    this.doubleTapDetect = this.doubleTapDetect.bind(this);
    this.resetAudioOri = this.resetAudioOri.bind(this);

    // local attributes
    this.audioFiles = audioFiles;
    this.bufferRouteMap = bufferRouteMap;
    this.touchDataMap = new Map();
    this.oriDataLast = [0, 0, 0];
    this.oriRefreshDist = 2.; // in deg str
    this.lastShakeTime = 0.0;
    this.accDataLast = [0, 0, 0];
    this.player = { soundId: -1, locationId: 0, inAmbiSphere: false };
    this.otherAzimValues = [-80, 0, 80]; // limiter to 3 + 1  players then
    this.lastTouchOnTime = 0;
    this.azimOffset = 0;
    this.forceOriUpdate = false;
    // this.touchIsActive = false;
    this.upDownState = 'up';
    this.introductionIsOver = false;
    this.playbackRate = 1.0;
    this.hasLoadedLanguageAudio = false;
  }

  // mecanism added to avoid starting the experiment while loading language files (loaded independently of other sounds to limit 
  // final load: simply loads the required language  file)
  waitUntilLoadedAudioFiles() {
    if( this.hasLoadedLanguageAudio )
      this.startBis();
    else
      setTimeout( () => { this.waitUntilLoadedAudioFiles(); }, 1000);
  }

  // start, before language files loaded
  start() {
    super.start(); // don't forget this

    // initialize the view
    this.view = new soundworks.CanvasView(viewTemplate, model, {}, {
      id: this.id,
      preservePixelRatio: true,
    });  

    // load language specific audio files
    let suffix = 'EN';
    if( client.language === 'fr'){ suffix = 'FR'; }
    let audioFilesLanguage = {
      22: 'sounds/speech-hall-' + suffix + '.mp3',
      23: 'sounds/speech-studio-' + suffix + '.mp3',
      24: 'sounds/attente-' + suffix + '.mp3',
      25: 'sounds/go-studio-1-' + suffix + '.mp3',
    }
    console.log('before', this.audioFiles.length, this.loader)
    this.loader.loadFiles(audioFilesLanguage).then( () => { 
      console.log('after', this.loader)
      this.hasLoadedLanguageAudio = true;
      // define new route names
      let offset = this.audioFiles.length;
      this.bufferRouteMap.set('instruction1', offset);
      this.bufferRouteMap.set('instruction2', offset + 1);
      this.bufferRouteMap.set('silence', offset + 2);
      this.bufferRouteMap.set('invite', offset + 3);

    }); /* remove waiting interface)*/

    // as show can be async, we make sure that the view is actually rendered
    this.show().then(() => {
      this.waitUntilLoadedAudioFiles();

      // initialize audio renderer
      this.soundHandler = new Audio.SoundHandler( this );

      // triggered when device receives new sound Id from server: turn off current sound set and simply update soundSet Id
      // restart is triggered later by player's input
      this.receive('soundId', (clientId, value) => {
        // discard if player not concerned
        if( clientId !== client.index ){ return; }
        // discard if no sound available (keep the same sound)
        if( value > -1 ){
          // stop current set
          this.soundHandler.stopSet(client.index, 2.5);
          // change local memory
          this.player.soundId = value;
        }
        else{
          console.warn('no more sounds vailable to switch with');
          this.soundHandler.playSound( this.bufferRouteMap.get('error_loc0') );
        }
      });

       // change behavior based on location (location is set by conductor via server)
       // location value 0 is hall, value 1 is studio 1
      this.receive('locationId', (value) => {
        // from hall to studio
        if( this.player.locationId == 0 && value == 1 ){
          // stop instruction sound
          this.soundHandler.stopSound( this.bufferRouteMap.get('instruction1'), 2 );
          // stop silence sound (e.g. when player enters studio 1 in silence mode)
          this.soundHandler.stopSound( this.bufferRouteMap.get('silence'), 2);
          // start new instruction sound
          this.soundHandler.playSound( this.bufferRouteMap.get('instruction2'), false, 1.0, 1.0 );
        }
        // from studio to hall (should not happend)
        if( this.player.locationId == 1 && value == 0 )
          return;

        // update local
        this.player.locationId = value;
      });

      // // sounds triggered directly from controller
      // this.params.addParamListener('playSound1', () => { 
      //   this.soundHandler.playSound( this.bufferRouteMap.get('instruction1') );
      // });
      // this.params.addParamListener('playSound2', () => { 
      //   this.soundHandler.playSound( this.bufferRouteMap.get('instruction2') );
      // });    

    });
  }

  // start, after language files loaded
  startBis(){
    this.initTouch();
    this.initMotion();

    // disable text selection, magnifier, and screen move on swipe on iOS
    document.getElementsByTagName("body")[0].addEventListener("touchstart",
    function(e) { e.returnValue = false });

    // param listeners: reload application from controller
    this.params.addParamListener('reload', () => { window.location.reload(true); } ); 
    // param listeners: reset sound field orientation from controller
    this.params.addParamListener('resetRotPlayer' + client.index, () => { this.resetAudioOri(); } );
    // param listeners: play audio file that invites player in studio
    this.params.addParamListener('invitePlayer' + client.index, () => { 
      this.soundHandler.playSound( this.bufferRouteMap.get('invite'), false, 0.4, 0.4 );
    });
    this.params.addParamListener('killPlayer' + client.index, () => {
      // play local goodbye
      this.soundHandler.playSound( this.bufferRouteMap.get('experienceOver'), false, 0.4, 0.6 );
      // notify OSC client
      this.sendToOsc(['experienceOver', 1]);
      // stop all sounds local
      this.soundHandler.stopAllSets(fadeInOutDuration);
      this.soundHandler.stopSound( this.bufferRouteMap.get('silence'), 2);
      this.soundHandler.stopSound( this.bufferRouteMap.get('instruction1'), 2);
      this.soundHandler.stopSound( this.bufferRouteMap.get('instruction2'), 2);
      // plan page reload in .. secs
      setTimeout( () => { window.location.reload(true); }, 5000);
    });    

    // initialize visual renderer
    this.renderer = new PlayerRenderer(colorList[client.index], bkgColorList[client.index]);
    this.view.addRenderer(this.renderer);

    // start instructions sound (no loop)
    setTimeout( () => { this.soundHandler.playSound( this.bufferRouteMap.get('instruction1'), false, 0.4, 1.0 ); }, 1000);

    // WARNING: may go wrong below if player sound id not arrived from server yet (but that's after 66 seconds... should not happend)

    // start set with delay to let instruction alone at startup
    setTimeout( () => { 
      // start sound
      this.soundHandler.startSet(client.index, this.player.soundId, true, 2.0); 
      // set colored screen
      this.renderer.setMode(1);
      // enable start/stop with gestures
      this.introductionIsOver = true;
    }, 66 * 1000 );

    // add language dependent instruction (double tap to reset orientation)
    let helpText = "double tap to reset orientation";
    if( client.language == 'fr' ){ 
      helpText = "double click pour réinitialiser l'orientation";
    }
    document.getElementById("title").innerHTML = helpText;

  }


  //////////////////////////////////////////////////////////////////
  // ORIENTATION CONTROL
  //////////////////////////////////////////////////////////////////

  initMotion() {

    this.oriArray = new CircularArray(50, [0,0,0, 0.0]);

    // Obtain a new *world-oriented* Full Tilt JS DeviceOrientation Promise
    var promise = FULLTILT.getDeviceOrientation({ 'type': 'world' });

    // Wait for Promise result
    promise.then( (deviceOrientation) => { // Device Orientation Events are supported

      // Register a callback to run every time a new 
      // deviceorientation event is fired by the browser.
      deviceOrientation.listen( () => {

        // skip gestures if introduction still running (can't do anything while)
        if( !this.introductionIsOver ){ return; }

        // Get the current *screen-adjusted* device orientation angles
        var currentOrientation = deviceOrientation.getScreenAdjustedEuler();

        // throttle mechanism
        let dist = Math.sqrt( Math.pow(currentOrientation.alpha - this.oriDataLast[0], 2) +
                              Math.pow(currentOrientation.beta - this.oriDataLast[1], 2) +
                              Math.pow(currentOrientation.gamma - this.oriDataLast[2], 2) );

        // playback rate
        this.playbackRate -= 0.0005;
        this.playbackRate = Math.max(0.8, this.playbackRate);
        this.soundHandler.setPlayBackRate(client.index, this.playbackRate);

        if ( dist < this.oriRefreshDist && this.forceOriUpdate == false ) { return; }

        // playback rate
        this.playbackRate += 0.004;
        this.playbackRate = Math.min(1.0, this.playbackRate);
        
        // unflag forced update 
        this.forceOriUpdate = false;

        // update new ori data saved
        this.oriDataLast[0] = currentOrientation.alpha;
        this.oriDataLast[1] = currentOrientation.beta;
        this.oriDataLast[2] = currentOrientation.gamma;

        if( Math.abs(currentOrientation.beta) > 90 ){ // screen topple from up to down
          
          currentOrientation.gamma = 180 - currentOrientation.gamma

          if( currentOrientation.beta > 0 ){ 
            currentOrientation.beta = 180 - currentOrientation.beta;
          }
          else{ 
            currentOrientation.beta = -180 - currentOrientation.beta;
          }
          // currentOrientation.beta = Math.sign(currentOrientation.beta) * (180 - currentOrientation.beta);
          currentOrientation.alpha = currentOrientation.alpha - 180;
        }
        else{
          if( currentOrientation.gamma < 0 ) // mod
            currentOrientation.gamma = 360 + currentOrientation.gamma;          
        }

        if( currentOrientation.gamma >= 90 && currentOrientation.gamma < 270 )
          currentOrientation.gamma = - currentOrientation.gamma + 360;

        // document.getElementById("value0").innerHTML = Math.round(currentOrientation.alpha * 10) / 10;
        // document.getElementById("value1").innerHTML = Math.round(currentOrientation.beta * 10) / 10;
        // document.getElementById("value2").innerHTML = Math.round(currentOrientation.gamma * 10) / 10;
        
        // when sound in device (not ambi sphere)
        if( !this.player.inAmbiSphere ){
          // update local volume pan
          this.soundHandler.setPan( client.index, currentOrientation.gamma );
          // update local sound set position
          this.soundHandler.setAzim( client.index, currentOrientation.alpha - this.azimOffset );
        }
        
        // send data to server
        this.sendToOsc(['deviceOrientation', currentOrientation.alpha - this.azimOffset, currentOrientation.beta, currentOrientation.gamma ]);
      

        // detect device upwards
        if( currentOrientation.beta > 10 && this.upDownState === 'down' ){
          // for hall location
          if( this.player.locationId == 0 ){
            this.send('gesture', client.index, 'swipeDown'); // legacy naming, do not bother..
            // stop waiting sound
            this.soundHandler.stopSound( this.bufferRouteMap.get('silence'), 2);
            // audio feedback sound
            this.soundHandler.playSound( this.bufferRouteMap.get('swipeDown_set' + this.player.soundId), false, 0.0, SWIPE_LVL );
            // visual feedback: set changed
            // document.getElementById("title").innerHTML = '' + this.player.soundId;
            this.renderer.setColor(colorList[this.player.soundId]);
            this.renderer.setMode(1); // set colored
            // start new audio set
            this.soundHandler.startSet( client.index, this.player.soundId, true, 3.0 );
            // resume instruction voice
            this.soundHandler.resumeSound( this.bufferRouteMap.get('instruction1') );     
          }

          if( this.player.locationId == 1 && this.player.inAmbiSphere == false){
            this.send('gesture', client.index, 'swipeUp');
            // sounds quits cellphone
            this.player.inAmbiSphere = true;
            this.soundHandler.stopAllSets(fadeInOutDuration);
            // visual update
            this.renderer.setMode(1);
            // audio feedback
            this.soundHandler.playSound( this.bufferRouteMap.get('swipeUp_set' + this.player.soundId), false, 0.0, SWIPE_LVL );    
          } 
          // update local attr
          this.upDownState = 'up';    
        }

        // device down for goodbye
        if( currentOrientation.beta <= -60 && this.upDownState === 'up' ){
          // in hall
          if( this.player.locationId == 0 ){
            // start waiting sound
            this.soundHandler.playSound( this.bufferRouteMap.get('silence'), true, 7, 1.5 );
            // notify server (to send new sound Id)
            this.send('gesture', client.index, 'swipeUp');
            // audio feedback
            this.soundHandler.playSound( this.bufferRouteMap.get('swipeUp_set' + this.player.soundId), false, 0.0, SWIPE_LVL );
            // visual feedback
            this.renderer.setMode(0); // set black
            // pause instruction voice
            this.soundHandler.pauseSound( this.bufferRouteMap.get('instruction1') );        
          }
          // in studio (from ambisonic to device)
          if( this.player.locationId == 1 && this.player.inAmbiSphere == true ){
            // notify server
            this.send('gesture', client.index, 'swipeDown');
            // sounds comes back to cellphone speakers
            this.soundHandler.startSet(client.index, this.player.soundId, true, fadeInOutDuration);
            // visual feedback
            this.renderer.setMode(0);
            // audio feedback
            this.soundHandler.playSound( this.bufferRouteMap.get('swipeDown_set' + this.player.soundId), false, 0.0, SWIPE_LVL );
            // update local attr
            this.player.inAmbiSphere = false;
          } 
        // update local attr
        this.upDownState = 'down';
        }

      });

    }).catch( (errorMessage) => { // Device Orientation Events are not supported
      console.log(errorMessage);
    });


    // setup motion input listeners (shake to change listening mode)
    if (this.motionInput.isAvailable('accelerationIncludingGravity')) {
      this.motionInput.addListener('accelerationIncludingGravity', (data) => {

          // throttle
          let delta = Math.abs(this.accDataLast[0] - data[0]) + Math.abs(this.accDataLast[1] - data[1]) + Math.abs(this.accDataLast[2] - data[2]);
          if( delta < 1.5 ){ return }

          // save new throttle values
          this.accDataLast[0] = data[0];
          this.accDataLast[1] = data[1];
          this.accDataLast[2] = data[2];

          let summedAcc = Math.abs( data[0] ) + Math.abs( data[1] ) + Math.abs( data[2] );
          this.sendToOsc(['deviceAcc', summedAcc]);
          
          // get acceleration data
          const mag = Math.sqrt(data[0] * data[0] + data[1] * data[1] + data[2] * data[2]);

          // send msg to server if shake detected
          if (mag > 40 && ( (audioContext.currentTime - this.lastShakeTime) > 0.5) ){
            // update throttle timer
            this.lastShakeTime = audioContext.currentTime;
            // notify server
            this.sendToOsc(['deviceShake', 1]);
          }
      });
    }    

  }


  //////////////////////////////////////////////////////////////////

  //////////////////////////////////////////////////////////////////
  // TOUCH CONTROL
  //////////////////////////////////////////////////////////////////

  initTouch() {
    const surface = new soundworks.TouchSurface(this.view.$el);

    // setup touch listeners (reset listener orientation on touch)
    surface.addListener('touchstart', (id, normX, normY) => {
      // reset
      this.touchDataMap.set(id, []);
      // save touch data
      this.touchDataMap.get(id).push([normX, normY, this.sync.getSyncTime()]);
      // send touch is on
      this.sendToOsc(['deviceTouchIsOn', 1]);
      // detect double tap
      this.doubleTapDetect();
    });

    surface.addListener('touchmove', (id, normX, normY) => {
      // save touch data
      this.touchDataMap.get(id).push([normX, normY, this.sync.getSyncTime()]);
      // send data to server
      this.sendToOsc(['deviceTouch', normX, normY]);
    });

    surface.addListener('touchend', (id, normX, normY) => {
      // save touch data
      this.touchDataMap.get(id).push([normX, normY, this.sync.getSyncTime()]);
      // gesture detection
      this.touchGestureDetect(this.touchDataMap.get(id));
      // send touch is off
      this.sendToOsc(['deviceTouchIsOn', 0]);
    });
  }

  getFingerSpeed(id){
    // get last touch pos + times
    let touchData = this.touchDataMap.get(id);
    let N = touchData.length-1;
    if( N < 1 ){ return[0,0]; }
    let dX = touchData[N][0] - touchData[N-1][0];
    let dY = touchData[N][1] - touchData[N-1][1];
    let dT = touchData[N][2] - touchData[N-1][2];
    return [ dX/dT, dY/dT ];
  }

  // reset orientation if double tap - TODO: transform in tripple tap?
  doubleTapDetect(){
    if( (audioContext.currentTime - this.lastTouchOnTime) < 0.4 ){ // tap time in sec
      this.resetAudioOri();
    }
    this.lastTouchOnTime = audioContext.currentTime;
  }

  // flag audio reset request (updated with orientation event afterwards)
  resetAudioOri(){
    // save offset
    this.azimOffset = this.oriDataLast[0];
    // require update (despite threshold)
    this.forceOriUpdate = true;
  }

  touchGestureDetect(data) {
    let N = data.length - 1;
    let pathVect = [data[N][0] - data[0][0], data[N][1] - data[0][1]];
    let pathDuration = data[N][2] - data[0][2];

    // discard slow movements
    if (pathDuration > 2.0) return;

    // // swipes
    // if (pathVect[1] > 0.4){
    //   this.send('gesture', client.index, 'swipeDown');
    //   if( this.player.locationId == 0 ){

    //     // TO DO: prevent swipe down effect if no swipe up detected before
    //     // audio feedback
    //     this.soundHandler.playSound( this.bufferRouteMap.get('swipeDown_set' + this.player.soundId) );
    //     // visual feedback
    //     document.getElementById("title").innerHTML = 'Set ' + this.player.soundId;
    //     this.renderer.setColor(colorList[this.player.soundId]);
    //     // start new set
    //     let fadeInDuration = 3.0;
    //     this.soundHandler.startSet( client.index, this.player.soundId, true, fadeInDuration );
    //     // stop waiting sound
    //     this.soundHandler.stopSound( this.bufferRouteMap.get('silence'), 7);
    //     // resume instruction voice
    //     this.soundHandler.resumeSound( this.bufferRouteMap.get('instruction1') );     
    //   }

    //   if( this.player.locationId == 1 && this.player.inAmbiSphere == true){
    //     // sounds comes back to cellphone speakers
    //     this.player.inAmbiSphere = false;
    //     // console.log('restart local sound', this.player.soundId)
    //     // this.soundHandler.stopAllSets(0.0);
    //     this.soundHandler.startSet(client.index, this.player.soundId, true, fadeInOutDuration);
    //     // visual feedback
    //     this.renderer.setMode(0);
    //     // audio feedback
    //     this.soundHandler.playSound( this.bufferRouteMap.get('swipeDown_set' + this.player.soundId) );
    //     // this.soundHandler.playSound( this.bufferRouteMap.get('swipeDown_loc1') );        
    //   }
    // }
    // if (pathVect[1] < -0.4){
    //   this.send('gesture', client.index, 'swipeUp');
    //   if( this.player.locationId == 0 ){
    //     // audio feedback
    //     this.soundHandler.playSound( this.bufferRouteMap.get('swipeUp_set' + this.player.soundId) );
    //     // visual feedback
    //     this.renderer.setColor('#000000'); // set black
    //     // play waiting sound
    //     this.soundHandler.playSound( this.bufferRouteMap.get('silence'), true, 7, 0.1 );
    //     // pause instruction voice
    //     this.soundHandler.pauseSound( this.bufferRouteMap.get('instruction1') );        
    //   }      
    //   if( this.player.locationId == 1 && this.player.inAmbiSphere == false ){
    //     // sounds quits cellphone
    //     this.player.inAmbiSphere = true;
    //     this.soundHandler.stopAllSets(fadeInOutDuration);
    //     // visual update
    //     // this.renderer.setMode(1);
    //     this.renderer.setMode(0);
    //     this.renderer.bkgColor = '#414242';
    //     // audio feedback
    //     this.soundHandler.playSound( this.bufferRouteMap.get('swipeUp_set' + this.player.soundId) );
    //   }    
    // }
  }

  //////////////////////////////////////////////////////////////////

  sendToOsc(msg){
    // only send if in Ambisonic env
    if( this.player.locationId == 0 || !this.player.inAmbiSphere ) return;
    msg.unshift(client.index);
    this.send('directToOSC', msg);
  }
}

class CircularArray {

  constructor(arrayLength, initValue = 0) {
    this.array = [];
    for (let i = 0; i < arrayLength - 1; i++) {
      this.array.push(initValue);
    }
  }

  push(newElmt){
    this.array.push(newElmt);
    this.array.shift;
  }

  get length(){
    return this.array.length;
  }
}








