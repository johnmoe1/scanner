var AudioStream = function(context)
{
  this.Paused = false;
  this.ClipsToBeLoaded = [];
  this.ClipBeingLoaded = null;

  this.ClipsToBeDecoded = [];
  this.ClipBeingDecoded = null;

  this.ClipsToBePlayed = [];
  this.ClipBeingPlayed = null;
  this.LastPlayedClip = null;
  this.myAudioContext = context;
  this.PlayedClips = [];
};

AudioStream.prototype.ClipIsPlaying = null;
AudioStream.prototype.MAX_LOADED_CLIPS = 8;
AudioStream.prototype.MAX_PLAYED_CLIPS = 4;

AudioStream.prototype.GetURL = function(x)
{
  return x.url;
};

AudioStream.prototype.GetGainValues = function(x)
{
  return [{"at":0, "gain":1}];
  //return [{"at":0, "gain":1}, {"at":1, "gain":0}, {"at":2, "gain":1}];
}

AudioStream.prototype.Pause = function()
{
  this.Paused = true;
  if (this.ClipBeingPlayed) {
    this.ClipBeingPlayed.source.stop(0);
    this.ClipsToBePlayed.splice(0,0,this.ClipBeingPlayed);
    this.ClipBeingPlayed = null;
  }
};

AudioStream.prototype.Resume = function()
{
  this.Paused = false;
  this.PlaySomething();
  this.LoadSomething();
};

AudioStream.prototype.Clear = function()
{
  if (this.ClipBeingPlayed) {
    this.ClipBeingPlayed.source.stop(0);
  }
  if (this.ClipBeingLoaded) {
    this.ClipBeingLoaded.cancel = true;
  }
  if (this.ClipBeingDecoded) {
    this.ClipBeingDecoded.cancel = true;
  }
  this.ClipBeingPlayed = null;
  this.ClipsToBePlayed = [];
  this.ClipsToBeDecoded = [];
  this.ClipsToBeLoaded = [];
  this.PlayedClips = [];
  this.LastPlayedClip = null;
};

AudioStream.prototype.Back = function()
{
  this.Pause();
  while (this.PlayedClips.length) {
    var x = this.PlayedClips.pop();
    this.ClipsToBePlayed.splice(0,0,x);
  }
  this.LastPlayedClip = null;
  this.Resume();
}

AudioStream.prototype.LoadSomething = function()
{
  if (this.Paused) {
    return;
  }
  if (this.ClipsToBePlayed.length >= this.MAX_LOADED_CLIPS) {
    return;
  }
  if (this.ClipBeingLoaded != null) {
    return;
  }
  while (this.ClipsToBeLoaded.length) {
      this.ClipBeingLoaded = this.ClipsToBeLoaded.shift();
      if (this.ShouldPlayClip && !this.ShouldPlayClip(this.ClipBeingLoaded)) {
         this.ClipBeingLoaded = null;
         continue;
      }

      var url = this.GetURL(this.ClipBeingLoaded);

      var x = new XMLHttpRequest();
      x.open("GET", url, true);
      x.responseType = 'arraybuffer';
      this.ClipBeingLoaded.req = x;
      x.addEventListener('load', this.ClipLoaded.bind(this), false);
      x.send();
      break;
   }
};

AudioStream.prototype.ClipLoaded = function()
{
   if (!this.ClipBeingLoaded.cancel) {
      this.ClipsToBeDecoded.push(this.ClipBeingLoaded);
   }
   this.ClipBeingLoaded = null;
   this.LoadSomething();
   this.DecodeSomething();
   this.PlaySomething();
};

AudioStream.prototype.DecodeSomething = function()
{
  if (this.Paused) {
    return;
  }
  if (this.ClipBeingDecoded) {
    return;
  }
  if (!this.ClipsToBeDecoded.length) {
    return;
  }
  this.ClipBeingDecoded = this.ClipsToBeDecoded.shift();
  this.DecodeClip();
}

AudioStream.prototype.DecodeClip = function()
{
  var cbd = this.ClipBeingDecoded;
  this.myAudioContext.decodeAudioData(cbd.req.response, this.ClipDecoded.bind(this));
}

AudioStream.prototype.ClipDecoded = function(buffer)
{
  this.ClipBeingDecoded.buffer = buffer;
  this.ClipsToBePlayed.push(this.ClipBeingDecoded);
  this.ClipBeingDecoded = null;
  this.PlaySomething();
  this.DecodeSomething();
}

AudioStream.prototype.PlaySomething = function()
{
  if (this.Paused) {
    return;
  }
  if (this.ClipBeingPlayed) {
    return;
  }
  if (!this.ClipsToBePlayed.length) {
    return;
  }
  var i;
  for (i = this.ClipsToBePlayed.length-1; i >= 0; --i) {
    if (this.ShouldPlayClip && !this.ShouldPlayClip(this.ClipsToBePlayed[i].tg)) {
         this.ClipsToBePlayed.splice(i, 1);
    }
  }

  if (this.LastPlayedClip && this.LastPlayedClip.tg) {
    var target_tg = this.LastPlayedClip.tg;
    var starting_before = this.LastPlayedClip.start + this.LastPlayedClip.len + 8000;
    var i;
    for (i = 0; i < this.ClipsToBePlayed.length; ++i) {
      var x = this.ClipsToBePlayed[i];
      if (x.tg == target_tg && x.start < starting_before) {
        x.hang = true;
        this.ClipBeingPlayed = x;
        this.ClipsToBePlayed.splice(i, 1);
        this.PlayClip();
        return;
      }
    }
  }

  this.ClipBeingPlayed = this.ClipsToBePlayed.shift();
  this.PlayClip();
};



AudioStream.prototype.PlayClip = function()
{
   var cbp = this.ClipBeingPlayed;
   cbp.source = this.myAudioContext.createBufferSource();
   var gainNode = this.myAudioContext.createGain();
   var gains = this.GetGainValues(cbp);
   var i = 0;
   for (i = 0; i < gains.length; ++i) {
      gainNode.gain.setValueAtTime(gains[i]["gain"], this.myAudioContext.currentTime + gains[i]["at"]);
   }
   if (false) {
     var dynCompNode = this.myAudioContext.createDynamicsCompressor();
     var preGainNode = this.myAudioContext.createGain();
     preGainNode.gain.value = 2;
     cbp.source.connect(preGainNode);
     preGainNode.connect(dynCompNode);
     dynCompNode.connect(gainNode);
     dynCompNode.threshold.value = -15;
     dynCompNode.knee.value = 20;
     dynCompNode.ratio.value = 6;
   } else {
      cbp.source.connect(gainNode);
   }
   gainNode.connect(this.myAudioContext.destination);
   cbp.source.onended = this.ClipDone.bind(this);
   cbp.source.buffer = cbp.buffer;
   if (cbp.source.noteOn) {
     cbp.source.noteOn(0);
   } else {
     cbp.source.start(0);
   }
   
  if (this.ClipIsPlaying) {
    this.ClipIsPlaying(cbp);
  }
  
  this.LoadSomething();
}

AudioStream.prototype.ClipDone = function(e)
{
  if (this.ClipBeingPlayed && e.target == this.ClipBeingPlayed.source) {
    this.LastPlayedClip = this.ClipBeingPlayed; 
    this.PlayedClips.push(this.ClipBeingPlayed);
    if (this.PlayedClips.length > this.MAX_PLAYED_CLIPS) {
      this.PlayedClips.shift();
    }
    this.ClipBeingPlayed = null;
  }

  if (this.ClipIsPlaying && this.ClipBeingPlayed == null) {
    this.ClipIsPlaying(null);
  }

  window.setTimeout(this.PlaySomething.bind(this),0);
}

