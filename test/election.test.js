var election = require('../lib/election');

var mod_path = require('path');

var mod_bunyan = require('bunyan');
var mod_once = require('once');
var mod_uuid = require('uuid');
var mod_vasync = require('vasync');
var mod_verror = require('verror');
var mod_zk = require('node-zookeeper-client');



///--- Globals

var LOG = mod_bunyan.createLogger({
    name: 'election.test.js',
    src: true,
    level: process.env.LOG_LEVEL || 'warn'
});
var DIR_PATH = '/' + mod_uuid().substr(0, 7);
var PATH = mod_uuid().substr(0, 7);
var ZK_URL = process.env.ZK_URL || 'localhost:2181';
var NUMBER_OF_VOTERS = parseInt(process.env.NUMBER_OF_VOTERS, 10) || 3;
var VOTERS = [];
var GLEADER;
var ZKS = [];
var TEST_TIMEOUT = process.env.TEST_TIMEOUT || 60 * 1000;
var VOTER_0;
var VOTER_1;
var VOTER_2;

exports.before = function (t) {
    var barrier = mod_vasync.barrier();
    barrier.on('drain', function () {
        LOG.info('done instantiating zk clients');
        t.done();
    });

    for (var i = 0; i < NUMBER_OF_VOTERS; i++) {
        barrier.start(i);
        ZKS[i] = mod_zk.createClient(ZK_URL);
        /* jshint loopfunc: true */
        ZKS[i].once('connected', function (i) {
            LOG.info({i: i}, 'connected');
            barrier.done(i);
        }.bind(this, i));
        ZKS[i].connect();
    }
};

exports.election_v0 = function (t) {
    var done = mod_once(t.done);
    // initialize 3 voters in series
    VOTER_0 = election.createElection({
        zk: ZKS[0],
        path: DIR_PATH,
        pathPrefix: 'VOTER_0',
        log: LOG
    }, function () {});

    VOTER_1 = election.createElection({
        zk: ZKS[1],
        path: DIR_PATH,
        pathPrefix: 'VOTER_1',
        log: LOG
    }, function () {});

    VOTER_2 = election.createElection({
        zk: ZKS[2],
        path: DIR_PATH,
        pathPrefix: 'VOTER_2',
        log: LOG
    }, function () {});

    var barrier = mod_vasync.barrier();
    barrier.on('drain', function () {
        removeVoterListeners();
        done();
    });

    barrier.start('gleader');
    VOTER_0.once('gleader', function () {
        barrier.done('gleader');
    });

    VOTER_0.once('leader', function () {
        LOG.error('got unexpected leader event');
        t.fail();
        done();
    });

    VOTER_0.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });

    barrier.start('topology');
    VOTER_0.once('topology', function (top) {
        t.equal(1, top.length, 'topology should only contain one element');
        t.equal('VOTER_0', top[0].split('-')[0],
                'unexpected element in topology');
        barrier.done('topology');
    });

    VOTER_0.vote();
};

exports.election_v1 = function (t) {
    var done = mod_once(t.done);
    var barrier = mod_vasync.barrier();
    barrier.on('drain', function () {
        removeVoterListeners();
        done();
    });

    barrier.start('follower');
    VOTER_0.once('follower', function (follower) {
        t.equal('VOTER_1', follower.split('-')[0], 'unexpected follower');
        barrier.done('follower');
    });

    barrier.start('v0topology');
    VOTER_0.once('topology', function (top) {
        t.equal(2, top.length, 'topology should only contain two elements');
        t.equal('VOTER_0', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_1', top[1].split('-')[0],
                'unexpected element in topology');
        barrier.done('v0topology');
    });
    VOTER_0.once('leader', function (leader) {
        LOG.error('election test failed, unexpected leader event');
        t.fail(err);
        done();
    });
    VOTER_0.once('gleader', function () {
        LOG.error('election test failed, unexpected gleader event');
        t.fail(err);
        done();
    });
    VOTER_0.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });

    barrier.start('v1topology');
    VOTER_1.once('topology', function (top) {
        t.equal(2, top.length, 'topology should only contain two elements');
        t.equal('VOTER_0', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_1', top[1].split('-')[0],
                'unexpected element in topology');
        barrier.done('v1topology');
    });
    barrier.start('leader');
    VOTER_1.once('leader', function (leader) {
        t.equal('VOTER_0', leader.split('-')[0], 'unexpected leader');
        barrier.done('leader');
    });
    VOTER_1.once('follower', function (follower) {
        LOG.error({follower: follower},
                  'election test failed, unexpected follower event');
        t.fail();
        done();
    });
    VOTER_1.once('gleader', function (gleader) {
        LOG.error('election test failed, unexpected gleader event');
        t.fail(err);
        done();
    });
    VOTER_1.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });

    VOTER_1.vote();
};

exports.election_v2 = function (t) {
    var done = mod_once(t.done);
    var barrier = mod_vasync.barrier();
    barrier.on('drain', function () {
        removeVoterListeners();
        done();
    });

    barrier.start('v0topology');
    VOTER_0.once('topology', function (top) {
        t.equal(3, top.length, 'topology should only contain two elements');
        t.equal('VOTER_0', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_1', top[1].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_2', top[2].split('-')[0],
                'unexpected element in topology');
        barrier.done('v0topology');
    });

    VOTER_0.once('leader', function (leader) {
        LOG.error('election test failed, unexpected leader event');
        t.fail(err);
        done();
    });
    VOTER_0.once('gleader', function () {
        LOG.error('election test failed, unexpected gleader event');
        t.fail(err);
        done();
    });
    VOTER_0.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_0.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });

    barrier.start('v1topology');
    VOTER_1.once('topology', function (top) {
        t.equal(3, top.length, 'topology should only contain two elements');
        t.equal('VOTER_0', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_1', top[1].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_2', top[2].split('-')[0],
                'unexpected element in topology');
        barrier.done('v1topology');
    });
    barrier.start('follower');
    VOTER_1.once('follower', function (follower) {
        t.equal('VOTER_2', follower.split('-')[0], 'unexpected follower');
        barrier.done('follower');
    });
    VOTER_1.once('gleader', function (gleader) {
        LOG.error('election test failed, unexpected gleader event');
        t.fail(err);
        done();
    });
    VOTER_1.once('leader', function (leader) {
        t.equal('VOTER_0', leader.split('-')[0], 'unexpected leader');
        barrier.done('leader');
    });
    VOTER_1.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });

    barrier.start('v2topology');
    VOTER_2.once('topology', function (top) {
        t.equal(3, top.length, 'topology should only contain two elements');
        t.equal('VOTER_0', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_1', top[1].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_2', top[2].split('-')[0],
                'unexpected element in topology');
        barrier.done('v2topology');
    });
    barrier.start('leader');
    VOTER_2.once('leader', function (leader) {
        t.equal('VOTER_1', leader.split('-')[0], 'unexpected leader');
        barrier.done('leader');
    });
    VOTER_2.once('follower', function (follower) {
        LOG.error({follower: follower},
                  'election test failed, unexpected follower event');
        t.fail();
        done();
    });
    VOTER_2.once('gleader', function (gleader) {
        LOG.error('election test failed, unexpected gleader event');
        t.fail(err);
        done();
    });
    VOTER_2.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });

    VOTER_2.vote();
};

exports.gleader_leave = function (t) {
    var done = mod_once(t.done);
    var barrier = mod_vasync.barrier();
    barrier.on('drain', function () {
        removeVoterListeners();
        done();
    });

    VOTER_0.once('topology', function (top) {
        LOG.error({top: topology}, 'should not have gotten topology event');
        t.fail();
        done();
    });

    VOTER_0.once('leader', function (leader) {
        LOG.error('election test failed, unexpected leader event');
        t.fail(err);
        done();
    });
    VOTER_0.once('gleader', function () {
        LOG.error('election test failed, unexpected gleader event');
        t.fail('election test failed, unexpected gleader event');
        done();
    });
    VOTER_0.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_0.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });

    barrier.start('v1topology');
    VOTER_1.once('topology', function (top) {
        t.equal(2, top.length, 'topology should only contain two elements');
        t.equal('VOTER_1', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_2', top[1].split('-')[0],
                'unexpected element in topology');
        barrier.done('v1topology');
    });
    VOTER_1.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });
    barrier.start('gleader');
    VOTER_1.once('gleader', function (gleader) {
        barrier.done('gleader');
    });
    VOTER_1.once('leader', function (leader) {
        t.fail('got unexpected leader event');
        done();
    });
    VOTER_1.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });

    barrier.start('v2topology');
    VOTER_2.once('topology', function (top) {
        t.equal(2, top.length, 'topology should only contain two elements');
        t.equal('VOTER_1', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_2', top[1].split('-')[0],
                'unexpected element in topology');
        barrier.done('v2topology');
    });
    VOTER_2.once('leader', function (leader) {
        LOG.error('election test failed, unexpected leader event');
        t.fail(err);
        done();
    });
    VOTER_2.once('gleader', function () {
        LOG.error('election test failed, unexpected gleader event');
        t.fail('election test failed, unexpected gleader event');
        done();
    });
    VOTER_2.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_2.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });

    VOTER_0.leave();
};

exports.v0_rejoin = function (t) {
    var done = mod_once(t.done);
    var barrier = mod_vasync.barrier();
    barrier.on('drain', function () {
        removeVoterListeners();
        done();
    });

    barrier.start('v0topology');
    VOTER_0.once('topology', function (top) {
        t.equal(3, top.length, 'topology should only contain two elements');
        t.equal('VOTER_0', top[2].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_1', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_2', top[1].split('-')[0],
                'unexpected element in topology');
        barrier.done('v0topology');
    });

    barrier.start('leader');
    VOTER_0.once('leader', function (leader) {
        t.equal('VOTER_2', leader.split('-')[0]);
        barrier.done('leader');
    });
    VOTER_0.once('gleader', function () {
        LOG.error('election test failed, unexpected gleader event');
        t.fail(err);
        done();
    });
    VOTER_0.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_0.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });

    barrier.start('v1topology');
    VOTER_1.once('topology', function (top) {
        t.equal(3, top.length, 'topology should only contain two elements');
        t.equal('VOTER_0', top[2].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_1', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_2', top[1].split('-')[0],
                'unexpected element in topology');
        barrier.done('v1topology');
    });
    VOTER_1.once('follower', function (follower) {
        t.fail('got unexpcted follower event');
        done();
    });
    VOTER_1.once('gleader', function (gleader) {
        LOG.error('election test failed, unexpected gleader event');
        t.fail(err);
        done();
    });
    VOTER_1.once('leader', function (leader) {
        t.fail('got unexpected leader event');
    });
    VOTER_1.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });

    barrier.start('v2topology');
    VOTER_2.once('topology', function (top) {
        t.equal(3, top.length, 'topology should only contain two elements');
        t.equal('VOTER_0', top[2].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_1', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_2', top[1].split('-')[0],
                'unexpected element in topology');
        barrier.done('v2topology');
    });
    VOTER_2.once('leader', function (leader) {
        t.fail('unexpected leader');
        t.done();
    });
    barrier.start('follower');
    VOTER_2.once('follower', function (follower) {
        t.equal('VOTER_0', follower.split('-')[0]);
        barrier.done('follower');
    });
    VOTER_2.once('gleader', function (gleader) {
        LOG.error('election test failed, unexpected gleader event');
        t.fail(err);
        done();
    });
    VOTER_2.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_0.vote();
};

exports['reset' + mod_uuid.v4()] = function (t) {
    resetVoterState(function (err, results) {
        if (err) {
            t.fail(err);
        }
        t.done();
    });
};

/**
 * v0 should emit topology, follower, v2 should emit topology, leader
 */
exports.v1_leave = function (t) {
    var done = mod_once(t.done);
    var barrier = mod_vasync.barrier();
    barrier.on('drain', function () {
        removeVoterListeners();
        done();
    });
    barrier.start('v0topology');
    VOTER_0.once('topology', function (top) {
        t.equal(2, top.length, 'topology should only contain two elements');
        t.equal('VOTER_0', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_2', top[1].split('-')[0],
                'unexpected element in topology');
        barrier.done('v0topology');
    });
    VOTER_0.once('leader', function (leader) {
        t.fail('unexpected leader event');
        done();
    });
    barrier.start('follower');
    VOTER_0.once('follower', function (follower) {
        t.equal('VOTER_2', follower.split('-')[0]);
        barrier.done('follower');
    });
    VOTER_0.once('gleader', function (gleader) {
        LOG.error('election test failed, unexpected gleader event');
        t.fail(err);
        done();
    });
    VOTER_0.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });

    VOTER_1.once('topology', function (top) {
        LOG.error({top: topology}, 'should not have gotten topology event');
        t.fail();
        done();
    });

    VOTER_1.once('leader', function (leader) {
        LOG.error('election test failed, unexpected leader event');
        t.fail(err);
        done();
    });
    VOTER_1.once('gleader', function () {
        LOG.error('election test failed, unexpected gleader event');
        t.fail('election test failed, unexpected gleader event');
        done();
    });
    VOTER_1.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_1.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });

    barrier.start('v2topology');
    VOTER_2.once('topology', function (top) {
        t.equal(2, top.length, 'topology should only contain two elements');
        t.equal('VOTER_0', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_2', top[1].split('-')[0],
                'unexpected element in topology');
        barrier.done('v2topology');
    });
    barrier.start('leader');
    VOTER_2.once('leader', function (leader) {
        t.equal('VOTER_0', leader.split('-')[0], 'unexpected leader');
        barrier.done('leader');
    });
    VOTER_2.once('follower', function (follower) {
        t.fail('unexpected follower event');
        done();
    });
    VOTER_2.once('gleader', function (gleader) {
        t.fail('election test failed, unexpected gleader event');
        done();
    });
    VOTER_2.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_1.leave();
};

exports['reset' + mod_uuid.v4()] = function (t) {
    resetVoterState(function (err, results) {
        if (err) {
            t.fail(err);
        }
        t.done();
    });
};

/**
 * v0 should emit topology, v1 should emit topology, leader, follower
 */
exports.v2_leave = function (t) {
    var done = mod_once(t.done);
    var barrier = mod_vasync.barrier();
    barrier.on('drain', function () {
        removeVoterListeners();
        done();
    });
    barrier.start('v0topology');
    VOTER_0.once('topology', function (top) {
        t.equal(2, top.length, 'topology should only contain two elements');
        t.equal('VOTER_0', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_1', top[1].split('-')[0],
                'unexpected element in topology');
        barrier.done('v0topology');
    });
    VOTER_0.once('leader', function (leader) {
        t.fail('unexpected leader event');
        done();
    });
    VOTER_0.once('follower', function (follower) {
        t.fail('unexpected follower event');
    });
    VOTER_0.once('gleader', function (gleader) {
        LOG.error('election test failed, unexpected gleader event');
        t.fail(err);
        done();
    });
    VOTER_0.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });

    barrier.start('v1topology');
    VOTER_1.once('topology', function (top) {
        t.equal(2, top.length, 'topology should only contain two elements');
        t.equal('VOTER_0', top[0].split('-')[0],
                'unexpected element in topology');
        t.equal('VOTER_1', top[1].split('-')[0],
                'unexpected element in topology');
        barrier.done('v1topology');
    });
    VOTER_1.once('leader', function (leader) {
        LOG.error('election test failed, unexpected leader event');
        t.fail(err);
        done();
    });
    VOTER_1.once('gleader', function () {
        LOG.error('election test failed, unexpected gleader event');
        t.fail('election test failed, unexpected gleader event');
        done();
    });
    VOTER_1.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    barrier.start('follower');
    VOTER_1.once('follower', function (follower) {
        t.equal(null, follower, 'follower should be null');
        barrier.done('follower');
    });

    VOTER_2.once('topology', function (top) {
        LOG.error({top: topology}, 'should not have gotten topology event');
        t.fail();
        done();
    });

    VOTER_2.once('leader', function (leader) {
        LOG.error('election test failed, unexpected leader event');
        t.fail(err);
        done();
    });
    VOTER_2.once('gleader', function () {
        LOG.error('election test failed, unexpected gleader event');
        t.fail('election test failed, unexpected gleader event');
        done();
    });
    VOTER_2.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_2.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });

    VOTER_2.leave();
};

exports['reset' + mod_uuid.v4()] = function (t) {
    resetVoterState(function (err, results) {
        if (err) {
            t.fail(err);
        }
        t.done();
    });
};

exports.v1v2_leave = function (t) {
    var done = mod_once(t.done);
    var barrier = mod_vasync.barrier();
    barrier.on('drain', function () {
        removeVoterListeners();
        done();
    });

    barrier.start('v0topology');
    VOTER_0.once('topology', function (top) {
        t.equal(1, top.length, 'topology should only contain one elements');
        t.equal('VOTER_0', top[0].split('-')[0],
                'unexpected element in topology');
        barrier.done('v0topology');
    });
    VOTER_0.once('leader', function (leader) {
        t.fail('unexpected leader event');
        done();
    });
    barrier.start('follower');
    VOTER_0.once('follower', function (follower) {
        t.equal(null, follower, 'did not get null follower');
        barrier.done('follower');
    });
    VOTER_0.once('gleader', function (gleader) {
        LOG.error('election test failed, unexpected gleader event');
        t.fail(err);
        done();
    });
    VOTER_0.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });

    VOTER_1.once('topology', function (top) {
        LOG.error({top: topology}, 'should not have gotten topology event');
        t.fail();
        done();
    });
    VOTER_1.once('leader', function (leader) {
        LOG.error('election test failed, unexpected leader event');
        t.fail(err);
        done();
    });
    VOTER_1.once('gleader', function () {
        LOG.error('election test failed, unexpected gleader event');
        t.fail('election test failed, unexpected gleader event');
        done();
    });
    VOTER_1.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_1.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });

    VOTER_2.once('topology', function (top) {
        LOG.error({top: topology}, 'should not have gotten topology event');
        t.fail();
        done();
    });
    VOTER_2.once('leader', function (leader) {
        LOG.error('election test failed, unexpected leader event');
        t.fail(err);
        done();
    });
    VOTER_2.once('gleader', function () {
        LOG.error('election test failed, unexpected gleader event');
        t.fail('election test failed, unexpected gleader event');
        done();
    });
    VOTER_2.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_2.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });

    VOTER_2.leave();
    VOTER_1.leave();
};

exports['reset' + mod_uuid.v4()] = function (t) {
    resetVoterState(function (err, results) {
        if (err) {
            t.fail(err);
        }
        t.done();
    });
};

exports.v0v1_leave = function (t) {
    var done = mod_once(t.done);
    var barrier = mod_vasync.barrier();
    barrier.on('drain', function () {
        removeVoterListeners();
        done();
    });

    VOTER_0.once('topology', function (top) {
        LOG.error({top: topology}, 'should not have gotten topology event');
        t.fail();
        done();
    });
    VOTER_0.once('leader', function (leader) {
        LOG.error('election test failed, unexpected leader event');
        t.fail(err);
        done();
    });
    VOTER_0.once('gleader', function () {
        LOG.error('election test failed, unexpected gleader event');
        t.fail('election test failed, unexpected gleader event');
        done();
    });
    VOTER_0.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_0.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });

    VOTER_1.once('topology', function (top) {
        LOG.error({top: topology}, 'should not have gotten topology event');
        t.fail();
        done();
    });
    VOTER_1.once('leader', function (leader) {
        LOG.error('election test failed, unexpected leader event');
        t.fail(err);
        done();
    });
    VOTER_1.once('gleader', function () {
        LOG.error('election test failed, unexpected gleader event');
        t.fail('election test failed, unexpected gleader event');
        done();
    });
    VOTER_1.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_1.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });

    barrier.start('v0topology');
    VOTER_2.once('topology', function (top) {
        t.equal(1, top.length, 'topology should only contain one elements');
        t.equal('VOTER_2', top[0].split('-')[0],
                'unexpected element in topology');
        barrier.done('v0topology');
    });
    VOTER_2.once('leader', function (leader) {
        LOG.error('election test failed, unexpected leader event');
        t.fail(err);
        done();
    });
    barrier.start('gleader');
    VOTER_2.once('gleader', function () {
        barrier.done('gleader');
    });
    VOTER_2.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_2.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });
    VOTER_0.leave();
    VOTER_1.leave();
};

exports['reset' + mod_uuid.v4()] = function (t) {
    resetVoterState(function (err, results) {
        if (err) {
            t.fail(err);
        }
        t.done();
    });
};

exports.v0v2_leave = function (t) {
    var done = mod_once(t.done);
    var barrier = mod_vasync.barrier();
    barrier.on('drain', function () {
        removeVoterListeners();
        done();
    });

    VOTER_0.once('topology', function (top) {
        LOG.error({top: topology}, 'should not have gotten topology event');
        t.fail();
        done();
    });
    VOTER_0.once('leader', function (leader) {
        t.fail('election test failed, unexpected leader event');
        done();
    });
    VOTER_0.once('gleader', function () {
        t.fail('election test failed, unexpected gleader event');
        done();
    });
    VOTER_0.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_0.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });

    barrier.start('v1topology');
    VOTER_1.once('topology', function (top) {
        t.equal(1, top.length, 'topology should only contain one elements');
        t.equal('VOTER_1', top[0].split('-')[0],
                'unexpected element in topology');
        barrier.done('v1topology');
    });
    VOTER_1.once('leader', function (leader) {
        LOG.error('election test failed, unexpected leader event');
        t.fail(err);
        done();
    });
    barrier.start('gleader');
    VOTER_1.once('gleader', function () {
        barrier.done('gleader');
    });
    VOTER_1.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    barrier.start('follower');
    VOTER_1.once('follower', function (follower) {
        t.equal(null, follower, 'follower should be null');
        barrier.done('follower');
    });

    VOTER_2.once('topology', function (top) {
        t.fail('got unexpected topology event');
        done();
    });
    VOTER_2.once('leader', function (leader) {
        t.fail('election test failed, unexpected leader event');
        done();
    });
    VOTER_2.once('gleader', function () {
        t.fail('election test failed, unexpected gleader event');
        done();
    });
    VOTER_2.once('error', function (err) {
        LOG.error({err: err}, 'election test failed');
        t.fail(err);
        done();
    });
    VOTER_2.once('follower', function (follower) {
        t.fail('follower emitted');
        done();
    });

    VOTER_0.leave();
    VOTER_2.leave();
};

exports.after = function (t) {
    for (var i = 0; i < NUMBER_OF_VOTERS; i++) {
        ZKS[i].close();
    }
    t.done();
};

function removeVoterListeners() {
    VOTER_0.removeAllListeners('gleader');
    VOTER_0.removeAllListeners('leader');
    VOTER_0.removeAllListeners('error');
    VOTER_0.removeAllListeners('follower');
    VOTER_0.removeAllListeners('topology');
    VOTER_1.removeAllListeners('gleader');
    VOTER_1.removeAllListeners('leader');
    VOTER_1.removeAllListeners('error');
    VOTER_1.removeAllListeners('follower');
    VOTER_1.removeAllListeners('topology');
    VOTER_2.removeAllListeners('gleader');
    VOTER_2.removeAllListeners('leader');
    VOTER_2.removeAllListeners('error');
    VOTER_2.removeAllListeners('follower');
    VOTER_2.removeAllListeners('topology');
}

function resetVoterState(cb) {
    mod_vasync.pipeline({funcs: [
        function (_, _cb) {
            VOTER_0.leave(_cb);
        },
        function (_, _cb) {
            VOTER_1.leave(_cb);
        },
        function (_, _cb) {
            VOTER_2.leave(_cb);
        },
        function (_, _cb) {
            VOTER_0.vote(_cb);
        },
        function (_, _cb) {
            VOTER_1.vote(_cb);
        },
        function (_, _cb) {
            VOTER_2.vote(_cb);
        }
    ], args: {}}, function (err, results) {
        return cb (err, results);
    });
}
