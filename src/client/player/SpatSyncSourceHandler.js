import * as ambisonics from 'ambisonics';
import * as soundworks from 'soundworks/client';

const audioContext = soundworks.audioContext;
const client = soundworks.client;

export class SoundHandler {
  constructor( soundworksExperience ) {
    this.soundworksExperience = soundworksExperience;

    this.masterFilter = audioContext.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.value = 20000;
    this.masterFilter.gain.value = 1;
    this.masterFilter.connect( audioContext.destination );

    this.masterGain = audioContext.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect( this.masterFilter );

    this.ambiSpat = new AmbiSpat();
    this.ambiSpat.out.connect( this.masterGain );

    this.id2buffersTable = this.soundworksExperience.bufferRouteMap.get('sets');
    this.audioSetMap = new Map();
    this.simpleSources = new Map();
  }

  // ID of 3-sound group to use
  startSet(clientId, id, loop = true, fadeInDuration = 0.1){

    // get audioSet
    var audioSet = this.audioSetMap.get(clientId);

    // create audio set if need be
    if( audioSet === undefined ){
        // console.log('create set', id, 'for client', clientId, '(i am', client.index, ')');
        // audio set gain
        let gain = audioContext.createGain();
        gain.gain.value = 0.0;     
        // audio set itself
        audioSet = {audioSources: [], gain: gain, id: id};
        // create audioSet sources (one per elmt in current id2buffersTable sub-elmt)
        this.id2buffersTable[id].forEach( () => {
            let audioSource = new AudioSource( this.soundworksExperience );
            audioSource.out.connect( gain );
            gain.connect( this.ambiSpat.getInput(clientId) ); // all connected to same inlet, one "spat" source
            audioSet.audioSources.push( audioSource );
        });
        // store audioSet
        this.audioSetMap.set(clientId, audioSet);
    }

    // fade in
    audioSet.gain.gain.cancelScheduledValues(audioContext.currentTime);
    audioSet.gain.gain.setValueAtTime(audioSet.gain.gain.value, audioContext.currentTime);
    audioSet.gain.gain.linearRampToValueAtTime(1.0, audioContext.currentTime + fadeInDuration); 

    // loop across sources in set
    audioSet.audioSources.forEach((audioSource, index) => {
        // stop eventual old sources
        audioSource.stop();
        // start new set
        let idOfBufferToBeUsed = this.id2buffersTable[id][index];
        audioSource.start(idOfBufferToBeUsed, 0, loop);
    });    
  }

  // ID of N-sound set to use
  stopSet(clientId, fadeOutDuration = 0.1){
    // get audioSet
    let audioSet = this.audioSetMap.get(clientId);
    if( audioSet === undefined ){ return; }
    // fade out
    const now = audioContext.currentTime;
    audioSet.gain.gain.cancelScheduledValues(now);
    audioSet.gain.gain.setValueAtTime(audioSet.gain.gain.value, now);
    audioSet.gain.gain.linearRampToValueAtTime(0.0, now + fadeOutDuration);
    // loop across source set
    audioSet.audioSources.forEach((audioSource, index) => {
        // stop eventual old sources
        audioSource.stop(now + fadeOutDuration);
    });

    // remove audio set from local
    this.audioSetMap.delete(clientId);
  }

  // stop all sources of all audio sets
  stopAllSets(fadeOutDuration = 0.1, ignoreId = -1){
    this.audioSetMap.forEach( (audioSet, clientId) => {
        if( clientId !== ignoreId ){
            // fade out
            // console.log('stop all sets', fadeOutDuration, audioSet.gain.gain.value);
            audioSet.gain.gain.cancelScheduledValues(audioContext.currentTime);
            audioSet.gain.gain.setValueAtTime(audioSet.gain.gain.value, audioContext.currentTime);
            audioSet.gain.gain.linearRampToValueAtTime(0.0, audioContext.currentTime + fadeOutDuration);   
            // stop                 
            audioSet.audioSources.forEach( (audioSource) => {
                //audioSource.stop(audioContext.currentTime + fadeOutDuration);
            });        
        }
    });
  }

  // for the whole set
  setPlayBackRate(clientId, value){
   // get audioSet
    let audioSet = this.audioSetMap.get(clientId);
    if( audioSet === undefined ){ return; }
    // loop across source set
    audioSet.audioSources.forEach((audioSource, index) => {
        audioSource.setPlaybackRate(value);
    });
  }

  // simple sound play (no spat)
  playSound(id, loop = false, fadeDuration = 0.0, volume = 1.0){

    let audioSource = this.simpleSources.get(id);

    // new source
    if( audioSource === undefined ){
        // create source
        audioSource = new AudioSource(this.soundworksExperience);
        this.simpleSources.set(id, audioSource );
        audioSource.out.connect( this.masterGain );
        // set gain
        if( fadeDuration < 0.01 )
            // direct
            audioSource.out.gain.value = volume;
        else{
            // with fadeIn
            audioSource.out.gain.cancelScheduledValues(audioContext.currentTime);
            audioSource.out.gain.setValueAtTime(0.0, audioContext.currentTime);
            audioSource.out.gain.linearRampToValueAtTime(volume, audioContext.currentTime + fadeDuration);            
        }
        // start source
        audioSource.start(id, 0, loop);
    }
    // already existing source (restart source)
    else{
        audioSource.stop();
        audioSource.start(id, 0, loop);
    }
  }

  pauseSound(id, fadeDuration = 0.0){
    let audioSource = this.simpleSources.get(id);
    if( audioSource === undefined ) return;
    audioSource.pause();
  }

  resumeSound(id, fadeDuration = 0.0){
    let audioSource = this.simpleSources.get(id);
    if( audioSource === undefined ) return;
    audioSource.resume();
  }

  // simple sound play (no spat)
  stopSound(id, fadeDuration = 0.0){

    let audioSource = this.simpleSources.get(id);

    // skip if source doesn't exist
    if( audioSource === undefined )
        return;

    // direct
    if( fadeDuration < 0.01 ){
        // stop audio
        audioSource.stop();
    }
    // fadeOut
    else{
        // set fade out
        audioSource.out.gain.cancelScheduledValues(audioContext.currentTime);
        audioSource.out.gain.setValueAtTime(audioSource.out.gain.value, audioContext.currentTime);
        audioSource.out.gain.linearRampToValueAtTime(0.0, audioContext.currentTime + fadeDuration);
        // plan stop 
        audioSource.stop(audioContext.currentTime + fadeDuration);
    }
    this.simpleSources.delete(id);
  }

  setPos(clientId, normXY){
    let azim = (180 / Math.PI) * Math.atan2( normXY[0], -normXY[1] );
    // console.log(normXY, azim);
    this.ambiSpat.setSourcePos(clientId, -azim, 0);
  }

  setAzim(clientId, azim){
    this.ambiSpat.setSourcePos(clientId, azim, 0);
  }

  // valid for 3-sources set
  setPan(clientId, oriDeg){
    // get audioSet
    let audioSet = this.audioSetMap.get(clientId);
    if( audioSet === undefined ){ return; }

    // norm data
    let ori = oriDeg * Math.PI / 180;
    let pan = [Math.max(Math.cos(ori), 0.0), 
               Math.max(Math.sin(ori), 0.0), 
               Math.max(-Math.sin(ori), 0.0) ];
    // set volume for each source of current audioSet
    audioSet.audioSources.forEach((audioSource, index) => {
        audioSource.setVolume( pan[index] );
    });
  }

  // valid for 5-sources set
  setPan2(clientId, normXY){
    // get audioSet
    let audioSet = this.audioSetMap.get(clientId);
    if( audioSet === undefined ){ return; }

    // norm data
    let coord = [ normXY[0] + 0.5, normXY[1] + 0.5 ]; // ball coord in 0-1
    
    
    // exp(-((x-1.0)^2)/0.1)
    let pan = [ this.getPanVal(coord, [0.25, 0.25]), 
                this.getPanVal(coord, [0.75, 0.25]), 
                this.getPanVal(coord, [0.25, 0.75]), 
                this.getPanVal(coord, [0.75, 0.75]), 
                this.getPanVal(coord, [0.5, 0.5])
               ];

    // console.log(pan);
    // set volume for each source of current audioSet
    // WARNING: only valid for max of 5 audioSource per set
    audioSet.audioSources.forEach((audioSource, index) => {
        audioSource.setVolume( pan[index] );
    });
    // console.log(Math.round(pan1*10)/10, Math.round(pan2*10)/10, Math.round(pan3*10)/10);
  }

  getPanVal(coord, coordMax){
    let sigma = 0.05;
    let gain = Math.exp( -Math.pow(coord[0]-coordMax[0],2) / sigma ) *
               Math.exp( -Math.pow(coord[1]-coordMax[1],2) / sigma );
    return gain;
  }

  setVolume(clientId, value){
    // get audioSet
    let audioSet = this.audioSetMap.get(clientId);
    if( audioSet === undefined ){ return; }

    audioSet.gain.gain.value = value;
  }

  setGlobalVolume(value){
    this.masterGain.gain.value = Math.max(0.0, Math.min(value, 1.0));
  }

  setGlobalFilter(value){
    this.masterFilter.frequency.value = value;
  }
}


/**
* Spherical coordinate system
* azim stands for azimuth, horizontal angle (eyes plane), 0 is facing forward, clockwise +
* elev stands for elevation, vertical angle (mouth-nose plane), 0 is facing forward, + is up
**/
export class AmbiSpat {
    constructor() {

        // create ambisonic decoder (common to all sources)
        this.ambisonicOrder = 2;
        this.decoder = new ambisonics.binDecoder(audioContext, this.ambisonicOrder);

        // load HOA to binaural filters in decoder
        var irUrl = 'IRs/HOA3_filters_virtual.wav';
        var loader_filters = new ambisonics.HOAloader(audioContext, this.ambisonicOrder, irUrl, (bufferIr) => { this.decoder.updateFilters(bufferIr); } );
        loader_filters.load();
        
        // rotator is used to rotate the ambisonic scene (listener aim)
        this.rotator = new ambisonics.sceneRotator(audioContext, this.ambisonicOrder);

        // create input / output nodes
        this.out = audioContext.createGain();
        this.out.gain.value = 1;

        // connect graph
        this.rotator.out.connect(this.decoder.in);
        this.decoder.out.connect(this.out);

        // local attributes
        this.sourceMap = new Map();
        this.listener = { aim: {azim:0, elev:0}, aimOffset: {azim:0, elev:0} };
    }

    // get / create input for new source to be plugged in
    getInput(id){
        // input already exists
        if( this.sourceMap.has(id) )
            return this.sourceMap.get(id).encoder.in;

        // create new input
        let encoder = new ambisonics.monoEncoder(audioContext, this.ambisonicOrder);
        // init input
        encoder.azim = 0; encoder.elev = 0; encoder.updateGains();
        encoder.out.connect(this.rotator.in);
        // store local
        this.sourceMap.set(id, { encoder:encoder });
        // return input
        return encoder.in;
    }

    // set source id position
    setSourcePos(id, azim, elev) {

        // check if source has been initialized (added to local map)
        if( !this.sourceMap.has(id) )
            return

        // get spat source
        let spatSrc = this.sourceMap.get(id);
            
        // throttle on set spat source encoder azim / elev values
        if( Math.abs(azim - spatSrc.encoder.azim) < 3 && Math.abs(elev - spatSrc.encoder.elev) < 3 )
            return

        // update pos
        spatSrc.encoder.azim = azim;
        spatSrc.encoder.elev = elev;
        spatSrc.encoder.updateGains();
    }

    // set listener aim / orientation (i.e. rotate ambisonic field)
    setListenerAim(azim, elev){

        // update rotator yaw / pitch
        this.rotator.yaw = azim - this.listener.aimOffset.azim;
        this.rotator.pitch = elev - this.listener.aimOffset.elev;
        this.rotator.updateRotMtx();

        // update local stored
        this.listener.aim.azim = azim;
        this.listener.aim.elev = elev;
    }

    // set listener aim offset (e.g. to "reset" orientation)
    resetListenerAim(azimOnly = true){

        // save new aim values
        this.listener.aimOffset.azim = this.listener.aim.azim;
        if( ! azimOnly ){
            this.listener.aimOffset.elev = this.listener.aim.elev;
        }

        // update listener aim (update encoder gains, useless when player constantly stream deviceorientation data)
        this.setListenerAim(this.listener.aim.azim, this.listener.aim.elev);
    }

}

export class AudioSource {
  constructor( soundworksExperience ) {
    this.buffers = soundworksExperience.loader.buffers;
    this.sync = soundworksExperience.sync;
    this.time = {start: 0.0, timeInBuffer: 0.0};
    this.currentParams = {bufferId: -1, loop: false, playbackRate: 1.0};
    this.pausedAtTime = 0.0;

    // create output (not deleted when source stops)
    this.out = audioContext.createGain();
    this.out.gain.value = 1;
    // dummy src
    this.src = audioContext.createBufferSource();
  }

  // start source at time, if time > 0, start source in as many seconds, 
  // if time < 0, start source from position in buffer as if source started 
  // then (eventually loop)
  start(idOfBufferToBeUsed, time = 0, loop = false, timeInBuffer = 0, isResume = false) {
    // create buffer source
    let src = audioContext.createBufferSource();
    let buffer = this.buffers[idOfBufferToBeUsed];
    if( buffer === undefined ){
        console.warn('wrong buffer index, not playing id:', idOfBufferToBeUsed);
        return
    }
    // check if anything left to play, discard otherwise
    if( timeInBuffer > buffer.duration){ return; }

    // remember buffer id (for resume's sake)
    this.currentParams.bufferId = idOfBufferToBeUsed;
    this.currentParams.loop = loop;
    // load buffer in source
    src.buffer = buffer;
    src.loop = loop;
    src.playbackRate.value = this.currentParams.playbackRate;
    // connect source
    src.connect(this.out);
    // start source
    src.start(time, timeInBuffer);

    // remember start time
    this.time.start = audioContext.currentTime;
    // reset time in buffer
    if( !isResume )
        this.time.timeInBuffer = 0.0;

    // store source
    this.src = src;
  }

  stop(time = 0, isPause = false){
    // reset offset in buffer if real stop (redundancy here.. compared to start's)
    if( !isPause )
        this.timeInBuffer = 0.0;
    try{ this.src.stop(time); }
    catch(e){ if( e.name !== 'InvalidStateError'){ console.error(e); } }
  }

  pause(){
    // console.log('pause sound', this.currentParams.bufferId);
    // remember position
    this.time.timeInBuffer += audioContext.currentTime - this.time.start;
    // stop sound
    this.stop(0, true);
  }

  resume(){
    // console.log('resume src', this.currentParams.bufferId, 'full time', this.buffers[this.currentParams.bufferId].duration, 'resume at time', this.time.timeInBuffer, this.time.start);
    // start source
    this.start(this.currentParams.bufferId, 0, this.currentParams.loop, this.time.timeInBuffer, true);
  }

  setVolume(volume){
    this.out.gain.value = volume;
  }

  setPlaybackRate(value){
    this.currentParams.playbackRate = value
    this.src.playbackRate.value = value;
  }

}

