// Copyright IBM Corp. 2013,2015. All Rights Reserved.
// Node module: strong-cluster-control
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

// null worker... it should not exit until explicitly disconnected

var assert = require('assert');
var cluster = require('cluster');
var net = require('net');

var control = require('../../index');
var debug = require('debug')('strong-cluster-control:workers:null');

debug('worker start id', cluster.worker.id, 'cmd:', process.env.cmd);

assert(!cluster.isMaster);

onCommand(process.env);

//debug('worker env', process.env);
debug('worker argv', process.argv);

process.send({
  env: process.env,
  argv: process.argv
});

process.on('message', onCommand);

function onCommand(msg) {
  if (msg.cmd === 'EXIT') {
    return process.exit(msg.code);
  }
  if (msg.cmd === 'BUSY') {
    makeBusy(function() {
      return process.send({cmd: 'BUSY'});
    });
  }
  if (msg.cmd === 'LOOP') {
    makeUnexitable(function() {
      return process.send({cmd: 'LOOP'});
    });
  }
  if (msg.cmd === 'GRACEFUL') {
    return shutdownGracefully();
  }
  if (msg.cmd === 'ERROR') {
    throw Error('On command, I error!');
  }
  if (msg.cmd === 'TEST-API-STUB') {
    testApiStub();
  }
}

process.on('internalMessage', function(msg) {
  debug('worker internalMessage', msg);
});

process.on('disconnect', function() {
  debug('worker disconnect');
});

process.on('exit', function() {
  debug('worker exit');
});

// Make ourselves busy, but when we get notified of shutdown, close the server
// connections, allowing disconnect to continue.
function shutdownGracefully() {
  var connections = [];
  var server = makeBusy(function() {
  });
  process.on('message', function(msg) {
    debug('worker, message', msg,
          'shutdown?', control.cmd.SHUTDOWN,
          'connections=', connections.length);
    if (msg.cmd === control.cmd.SHUTDOWN) {
      connections.forEach(function(conn) {
        debug('worker says bye to peer', conn.remotePort);
        conn.end('bye');
      });
    }
  });

  // echo data
  server.on('connection', function(connection) {
    debug('worker, on server/connection');
    connection.on('data', function(data) {
      this.write(data);
    });
  });

  // remember connection, so we can close it on graceful shutdown
  server.on('connection', connections.push.bind(connections));
}

function makeUnexitable(callback) {
  process.on('SIGTERM', function() { }); // Ignore SIGTERM
  process.on('exit', function() {
    /* eslint no-constant-condition:0 */
    /* eslint no-empty:0 */
    while (true){}
  });
  process.nextTick(callback);
}

// disconnect does not take place until all servers are closed, which doesn't
// happen until all connections to servers are closed, so create a connection to
// self and don't close
function makeBusy(callback) {
  var server;
  var port;

  server = net.createServer()
    .listen(0, function() {
      port = server.address().port;
      debug('worker: listen on port', port);
      createClient();
    })
    .on('connection', acceptClient)
    .on('close', function() {
      debug('worker: on server/close');
    });


  function acceptClient(accept) {
    var remotePort = accept.remotePort;
    debug('worker: accept', accept.address(), remotePort);

    accept.on('close', function() {
      debug('worker: on accept/close', remotePort);
    });
    accept.on('end', function() {
      debug('worker: on accept/end, .end() our side');
      accept.end();
    });
  }

  function createClient() {
    debug('worker: connect to port', port);
    net.connect(port)
      .on('connect', function() {
        debug('worker: on client/connect, send ONLINE to master');
        callback();
      });
  }
  return server;
}

function testApiStub() {
  control.start({
    size: control.CPUS
  }).on('error', function() {
  }).stop(function () {
  }).once('error', function() {
  });

  process.exit();
}
