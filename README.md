# node-red-contrib-ffmpeg-wasm
A Node-RED node to executed ffmpeg commands via WebAssembly (WASM)

## Install
Run the following npm command in your Node-RED user directory (typically ~/.node-red):
```
npm install bartbutenaers/node-red-contrib-ffmpeg-wasm
```

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
