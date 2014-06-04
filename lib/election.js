var mod_events = require('events');
var mod_path = require('path');
var mod_util = require('util');

var mod_assert = require('assert-plus');
var mod_bunyan = require('bunyan');
var mod_underscore = require('underscore');
var mod_vasync = require('vasync');
var mod_verror = require('verror');
var mod_zk = require('node-zookeeper-client');

function Election(opts, cb) {
    var self = this;

    mod_assert.object(opts, 'opts');
    mod_assert.func(cb, 'cb');
    mod_assert.string(opts.path, 'opts.path');
    mod_assert.optionalString(opts.pathPrefix, 'opts.pathPrefix');
    mod_assert.object(opts.zk, 'opts.zk');
    mod_assert.optionalObject(opts.log, 'opts.log');

    mod_events.EventEmitter.call(this);

    if (opts.log) {
        this._log = opts.log.child({'component': 'node-leader'});
    } else {
        this._log = mod_bunyan.createLogger({
            name: 'node-leader',
            src: 'true',
            level: 'debug'
        });
    }

    this._path = mod_path.normalize(opts.path);
    this._pathPrefix = opts.pathPrefix;
    this._zk = opts.zk;
    this._znode = null;
    this._myLeader = null;
    this._myFollower = null;
    this._isGLeader = false;
    this._topology = [];

    return cb();
}
mod_util.inherits(Election, mod_events.EventEmitter);

module.exports = {
    /**
     * Create a new Election object
     */
    createElection: function (opts, cb) {
        return new Election(opts, cb);
    }
};

/**
 * Leave this election.
 * @param cb [Function] cb, invoked when we have left the election.
 */
Election.prototype.leave = function leave(cb) {
    mod_assert.optionalFunc(cb, 'cb');

    var self = this;
    var log = self._log;

    log.info({
        path: self._path,
        znode: self._znode
    }, 'election.leave: entered');

    // remove listeners.
    self.removeAllListeners('gleader');
    self.removeAllListeners('leader');
    self.removeAllListeners('follower');
    self.removeAllListeners('topology');

    self._myLeader = null;
    self._myFollower = null;
    self._isGLeader = null;

    process.nextTick(function () {
        self.removeAllListeners('error');
    });

    // remove znode if it exists.
    if (self._znode) {
        var znodeFullPath = self._path + '/' + self._znode;
        log.info({ path: znodeFullPath }, 'election.leave: removing znode');
        self._zk.remove(znodeFullPath, function (err) {
            if (err) {
                log.error({err: err}, 'election.leave: unable to remove znode');
                self.emit('error', err);
            }

            self._znode = null;
            if (cb) {
                return cb();
            }
        });
    } else {
        if (cb) {
            return cb();
        }
    }
};

/**
 * Participate and vote in this election.
 * @param cb [Function] callback, invoked when we have joined the electon.
 */
Election.prototype.vote = function vote(cb) {
    mod_assert.optionalFunc(cb, 'cb');

    var self = this;
    var log = self._log;

    log.info({
        path: self._path,
        pathPrefix: self._pathPrefix
    }, 'election.vote: entered');

    mod_vasync.pipeline({funcs: [
        function _mkdirp(_, _cb) {
            self._zk.mkdirp(self._path, _cb);
        },
        function _vote(_, _cb) {
            var path = self._pathPrefix ?
                self._path + '/' + self._pathPrefix + '-' : self._path + '/-';
            log.info({
                path: path
            }, 'election.vote: creating election node');
            self._zk.create(
                path,
                mod_zk.CreateMode.EPHEMERAL_SEQUENTIAL,
                function (err, zPath) {
                    self._znode = mod_path.basename(zPath);
                    log.info({
                        path: path,
                        znode: self._znode
                    }, 'election.vote: finished creating election node');
                    return _cb(err);
                }
            );
        },
        function _watch(_, _cb) {
            self.watch(_cb);
        }
    ], arg: {}}, function (err, results) {
        log.info({err: err, results: results}, 'election.vote: exiting');
        if (err) {
            self.emit('error', err);
        }

        if (cb) {
            return cb();
        }
    });
};

/**
 * Watch this election and emit the topology everytime it changes.
 * @param cb [Function] callback, invoked when the watch has finished
 * initializing.
 */
Election.prototype.watch = function watch(cb) {
    mod_assert.optionalFunc(cb, 'cb');

    var self = this;
    var log = self._log;

    log.info({
        path: self._path,
        pathPrefix: self._pathPrefix,
        znode: self._znode
    }, 'election.watch: entered');

    function getChildrenCallback (err, data) {
        log.info({
            err: err,
            data: data
        }, 'Election.watch: returned from getChildren');

        if (err) {
            // XXX what to do if the error is disconnected?
            self.emit('error', err);
        } else {
            data.sort(compare);
            log.info({
                data: data,
                znode: self._znode
            }, 'Election.watch: sorted election nodes.');
            // only emit election events if we are participating in it.
            if (self._znode) {
                var myIndex = data.indexOf(self._znode);
                if (myIndex === -1) {
                    self.emit('error', new mod_verror.VError(
                        'my own znode not found in zk'));
                }
                var myLeader = (myIndex === 0 ? null : data[myIndex - 1]);
                var myFollower = ((myIndex + 1 === data.length) ? null :
                                  data[myIndex + 1]);
                log.info({
                    currentMyLeader: self._myLeader,
                    currentMyFollower: self._myFollower,
                    currentIsGLeader: self._isGLeader,
                    myIndex: myIndex,
                    newMyLeader: myLeader,
                    newMyFollower: myFollower
                }, 'Election.watch: determining new election state.');

                if (myIndex === -1) {
                    return self.emit('error', new mod_verror.VError(
                        'my own znode not found in zk.'));
                }
                if (myIndex === 0 && !self._isGLeader) {
                    self._myLeader = null;
                    self._isGLeader = true;
                    self.emit('gleader');
                }
                if (self._myFollower !== myFollower) {
                    self._myFollower = myFollower;
                    self.emit('follower', self._myFollower);
                }
                if (!self._myLeader) {
                    self._myLeader = null;
                }
                if (self._myLeader !== myLeader) {
                    self._myLeader = myLeader;
                    self.emit('leader', self._myLeader);
                }
            }

            // only emit the topology if it changes.
            log.info({
                newTopology: data,
                oldTopology: self._topology
            }, 'checking topology');
            if (!mod_underscore.isEqual(data, self._topology)) {
                log.info({
                    newTopology: data,
                    oldTopology: self._topology
                }, 'topology changed, emitting topology event');

                self._topology = data;
                self.emit('topology', data);
            }
        }
    }

    self._zk.getChildren(
        self._path,
        function watcher (event) {
            log.debug({
                event: event,
                path: self._path,
                pathPrefix: self._pathPrefix,
                znode: self._znode
            }, 'got watch event');
            if (event.getType() === mod_zk.Event.NODE_CHILDREN_CHANGED) {
                self._zk.getChildren(self._path, getChildrenCallback);
            } else if (event.getType()== mom_zk.Event.NODE_DELETED) {
                self.emit('error',
                          new mod_verror.VError('election node deleted'));
            }
            // everytime the watch event fires, we need to watch again
            // regardless of the watch event since the watch only fires once.
            self.watch();
        },
        function (err, data) {
            getChildrenCallback(err, data);
            log.info('election.watch: exiting');
            if (cb) {
                return cb();
            }
        }
    );
};

/**
 * @private
 * Compares two lock paths.
 * @param {string} a the lock path to compare.
 * @param {string} b the lock path to compare.
 * @return {int} Positive int if a is bigger, 0 if a, b are the same, and
 * negative int if a is smaller.
 */
function compare(a, b) {
    var seqA = parseInt(a.substring(a.lastIndexOf('-') + 1), 10);
    var seqB = parseInt(b.substring(b.lastIndexOf('-') + 1), 10);

    return (seqA - seqB);
}
