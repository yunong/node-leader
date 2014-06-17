node-leader
===========

#Zookeeper based elections

Node-leader is an distributed election library built on top of zookeeper. It is
a straight implementation of the Zookeeper
[Leader-Election](http://zookeeper.apache.org/doc/trunk/recipes.html#sc_leaderElection)
algorithm in node.

# Internals
You can think of this election as a daisy chain of nodes.
```
a->b->c->d->e...
```

Each node will only be aware of the node directly adjacent to it, e.g. `b` is
only aware of `a` and `c`. The head of the daisy chain is special and is known
as the global leader.

The election is built on top of zk
[emphemeral](http://zookeeper.apache.org/doc/r3.2.1/zookeeperProgrammers.html#Ephemeral+Nodes)
[sequence](http://zookeeper.apache.org/doc/r3.2.1/zookeeperProgrammers.html#Sequence+Nodes+--+Unique+Naming)
nodes under a specific path. Each voter creates a node under the election path
(the prefix a,b,c,d,e is optional).

```
/election/a-00
/election/b-01
/election/c-02
/election/d-03
/election/e-04
```

As new voters join, they will create new nodes with a monotonically increasing
sequence number. When voters expire, their ephemeral nodes are automatically
removed by zookeeper.

# API

The library emits 4 events as part of its API:

`topology` This will emit a sorted array of nodes in the election:
`[a,b,c,d,e]` This is the only event that's emitted if you are only watching
the election.

`gleader` This will only be emitted once by the global leader of the election,
which in this case is `a`.

`follower` This is emitted everytime the current follower of self is updated.
e.g. `b` will get a `follower` event, with `c` as its follower.

`leader` This is emitted everytime the current leader of self is updated. e.g.
`b` will get a `leader` event, with `a` as the leader.


# Usage
You can use node-leader to either watch an election, or participate in an
election. Watching an election means you will only get the `topology` events,
but will not actually create any emphemeral nodes of your own. This is useful
for clients or services that depend on the election. By participating in the
election, via `vote()`, you will additionally emit the `gleader`, `leader` and
`follower` events. Node-leader expects you to pass it a handle to a already
connected
[node-zookeeper-client](https://github.com/alexguan/node-zookeeper-client.git).

To watch an election:
```javascript

var leader = require('node-leader');

...
// create a client and connect to ZK.
var zkClient = ...
...

var watcher = leader.createElection({
    zk: zkClient,
    path: '/glorious_election'
});

watcher.on('topology', function (top) {
    console.log('got election topology', top);
});
```

To participate in an election:
```javascript

var leader = require('node-leader');

...
// create a client and connect to ZK.
var zkClient = ...
...

voter = leader.createElection({
    zk: zkClient,
    path: '/glorious_election',
    // the optional prefix of the node path. This is usually used to identify
    // the node in the election. Having a prefix means you can fetch data about
    // this node just from the topology event, without having to explicitly get
    // the node itself.
    prePath: 'kim-jung-number-un',
    // optional data to attach to the ephemeral ZK node.
    data: {'platform': 'all the time Juche is great, Juche is great all the time'}
});

// i am the head of the chain
voter.on('gleader', function () {
    console.log('i am now the global election leader');
});

// the guy in front
voter.on('leader', function (myLeader) {
    console.log('my leader is', myLeader);
});

// the guy behind me
voter.on('follower', function (myFollower) {
    console.log('my follower is', myFollower);
});

voter.on('error', function (err) {
    console.error('got error', err);
});

// join the election.
voter.vote();
```

# Contributions
Contributions are welcome. Please make sure `npm test` runs cleanly.

# License
The MIT License (MIT)

Copyright (c) 2014 Yunong J Xiao

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
