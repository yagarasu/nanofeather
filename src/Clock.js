var Clock = function (speed) {
  this.events = {};
  this.speed = speed;
  this.timer = null;
};

Clock.prototype.on = function (event, callback) {
  if (this.events[event]) {
    this.events[event].push(callback);
  } else {
    this.events[event] = [callback];
  }
};

Clock.prototype.trigger = function (event, data) {
  if (this.events[event]) {
    for (var i = 0; i < this.events[event].length; i++) {
      var stopPropagation = false,
        fnStopPropagation = function () { stopPropagation = true; };
      this.events[event][i](data, fnStopPropagation);
      if (stopPropagation) break;
    }
  }
};

Clock.prototype.tick = function () {
  this.trigger('tick');
};

Clock.prototype.start = function () {
  this.timer = setInterval(this.tick.bind(this), this.speed);
  this.trigger('start');
};

Clock.prototype.stop = function () {
  clearInterval(this.timer);
  this.timer = null;
  this.trigger('stop');
};

module.exports = Clock;