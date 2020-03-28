# node-red-contrib-ffmpeg-wasm
A Node-RED node to executed ffmpeg commands via WebAssembly (WASM)

## Install
Run the following npm command in your Node-RED user directory (typically ~/.node-red):
```
npm install bartbutenaers/node-red-contrib-ffmpeg-wasm
```

**CAUTION:* As this node uses `worker_threads` which was introduced in Node.js v10.5.0, please remember to add `--experimental-worker` if you are using Node.js v10, and you don't have to add anything if you are using ***Node.js v12***!

## TODO
- [ ] currently node-red crashes when trying to read an unexisting file
- [ ] allow placeholders to be used inside the command field
- [ ] stopping an rtsp stream should be able via stopping the running command, not terminating the worker
      (otherwise the entire wasm need to be loaded again afterwards)
- [ ] support multiple ffmpeg nodes in a flow: probably using the jobid
- [ ] is it possible to mount a file of the host disc, for large files?
- [ ] check cpu and memory usage
- [ ] compare performance to a native C ffmpeg installation

## Node usage

![ffmpeg_demo](https://user-images.githubusercontent.com/14224149/77818234-233e9080-70d1-11ea-830c-b20236f9dda3.gif)
```
[{"id":"270cbbba.0d9eb4","type":"ffmpeg_wasm","z":"b25092e6.f35db","name":"","command":"-i rip.jpg rip.bmp","bindings":[{"direction":"input","field":"payload","filename":"rip.jpg"},{"direction":"output","field":"payload","filename":"rip.bmp"}],"x":930,"y":140,"wires":[["acc20237.4920b"],["9f8763e6.2bdf9"]]},{"id":"a402186.85ae3e8","type":"http request","z":"b25092e6.f35db","name":"","method":"GET","ret":"bin","paytoqs":false,"url":"https://upload.wikimedia.org/wikipedia/commons/e/e0/JPEG_example_JPG_RIP_050.jpg","tls":"","persist":false,"proxy":"","authType":"","x":750,"y":160,"wires":[["270cbbba.0d9eb4"]]},{"id":"92c477c3.e12488","type":"inject","z":"b25092e6.f35db","name":"Convert image","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":540,"y":160,"wires":[["a402186.85ae3e8"]]},{"id":"acc20237.4920b","type":"image","z":"b25092e6.f35db","name":"","width":160,"data":"payload","dataType":"msg","thumbnail":false,"active":true,"x":1160,"y":40,"wires":[]},{"id":"1ae3a57f.cf12eb","type":"inject","z":"b25092e6.f35db","name":"Start worker","topic":"start_worker","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":750,"y":60,"wires":[["270cbbba.0d9eb4"]]},{"id":"a31ab623.39dbc8","type":"inject","z":"b25092e6.f35db","name":"Stop worker","topic":"stop_worker","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":750,"y":100,"wires":[["270cbbba.0d9eb4"]]},{"id":"9f8763e6.2bdf9","type":"debug","z":"b25092e6.f35db","name":"Show worker status","active":true,"tosidebar":true,"console":false,"tostatus":true,"complete":"payload","targetType":"msg","x":1160,"y":240,"wires":[]}]
```

## Node properties

### Command

The ffmpeg command to be used.  When the command contains filenames, this will be virtual in-memory files!  It are not physical files on the filesystem of the host!

Remark: It doesn't matter whether the command starts with <code>ffmpeg</code> or not...

### Load the wasm file automatically at startup

When selected, the background worker will be started automatically at startup (or after a deploy). When not selected, the background worker needs to be started by injecting a message with ```msg.topic = "start_worker"```

### Bindings

When filenames are being used in the ffmpeg command, those virtual files need to be binded to fields in the input/output messags.  Add a binding rule for each virtual file:
+ **Direction** Specifiy whether the direction of the binding:
   + ***Input:*** The content of the *input* message field will be written into the virtual *input* file.
   + ***Output:*** The content of the virtual *output* file will be read and send in the *output* message field.     
+ ***Message field:*** The name of the field in the (input or output) message.
+ ***Virtual file name:*** The name of the virtual file in the ffmpeg command.
