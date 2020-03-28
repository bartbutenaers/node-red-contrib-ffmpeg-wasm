/**
 * Copyright 2020 Bart Butenaers
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
 module.exports = function(RED) {
    const { createWorker } = require('@ffmpeg/ffmpeg');
    
    // TODO's:
    // - currently node-red crashes when trying to read an unexisting file
    // - allow placeholders to be used inside the command field
    // - stopping an rtsp stream should be able via stopping the running command, not terminating the worker
    //   (otherwise the entire wasm need to be loaded again afterwards)
    // - support multiple ffmpeg nodes in a flow: probably using the jobid
    // - is it possible to mount a file of the host disc, for large files?
    // - check cpu and memory usage
    // - compare performance to a native C ffmpeg installation


    
    function FFmpegWasmNode(config) {
        RED.nodes.createNode(this, config);
        this.command       = config.command;
        this.bindings      = config.bindings;
        this.workerStarted = false;
        this.busy          = false;

        var node = this;
        
        // TODO remove
        const { setLogging } = require('@ffmpeg/ffmpeg');
        setLogging(true);
        
        // When the command starts with "ffmpeg " then remove that part of the command
        node.command = node.command.replace(/^ffmpeg /,"");
        
        node.status({fill:'red', shape:'dot', text:'stopped'});
        
        function startWorker(node) {
            if (node.worker) {
                console.log("No need to start the worker, because it was started already");
                return;
            }
            
            node.status({fill:'yellow', shape:'ring', text:'starting ...'});
            
            // Create an ffmpeg worker (i.e. a child process in NodeJs).
            node.worker = createWorker();

            // It takes some time to load the wasm
            node.worker.load().then(function() {
                node.status({fill:'green', shape:'dot', text:'ready'});
                node.send([null, {payload: "started", topic: "started"}]);
                node.workerStarted = true;
            }).catch(function(error) {
                node.error("Error when starting worker: " + error);
                node.status({fill:'red', shape:'dot', text:'starting failed'});
            }).finally(function() {
            });              
        }
        
        function stopWorker(node) {
            if (!node.worker) {
                console.log("No need to stop the worker, because it was not running yet");
                return;
            }
            
            node.status({fill:'yellow', shape:'ring', text:'stopping ...'});
            
            node.worker.terminate().then(function() {
                node.status({fill:'red', shape:'dot', text:'stopped'});
                node.send([null, {payload: "stopped", topic: "stopped"}]);
                node.busy = false;
                node.workerStarted = false;
                node.worker = null;
            }).catch(function(error) {
                node.error("Error when closing worker: " + error);
                node.status({fill:'red', shape:'dot', text:'stopping failed'});
            }).finally(function() {
            });     
        }
        
        if (config.loadAtStartup) {
            startWorker(node);
        }

        node.on("input", async function(msg) {
            var inputImage = msg.payload;
            
            if (msg.topic === "start_worker") {
                startWorker(node);
                return;
            }
            
            if (msg.topic === "stop_worker") {
                stopWorker(node);
                return;
            }
            
            if (!node.worker) {
                node.warn("Ignore input message since the worker is not available yet");
                return;
            }
            
            if (!node.workerStarted) {
                node.warn("Ignore input message since the wasm module is not loaded yet");
                return;
            }
            
            if (node.busy) {
                node.warn("Ignore input message since the worker is busy with the previous msg");
                return;
            }
            
            // Process all the input bindings: which means we get the input message field, and write it as an input file
            // into the Emscripten file system (of the worker where ffmpeg can load it)
            for (var i = 0; i < node.bindings.length; i++) {
                var binding = node.bindings[i];
                
                if (binding.direction === "input") {
                    var msgFieldValue;
                    
                    try {
                        msgFieldValue = RED.util.getMessageProperty(msg, binding.field);
                    }
                    catch(error) {
                        node.error("Ignore input message since it doesn't contain input binding field msg." + binding.field + " : " + error);
                        return;
                    }
                    
                    if (!Buffer.isBuffer(msgFieldValue)) {
                        node.error("Ignore input message since the " + binding.field + " does not contain a buffer");
                        return;
                    }
                    
                    try {
                        await node.worker.write(binding.filename, msgFieldValue);
                    }
                    catch(error) {
                        node.error("Ignore input message since we cannot write the content of input file " + binding.filename + " : " + error);
                        return;
                    }
                }
            }
                        
            node.busy = true;
            node.status({fill:'green', shape:'ring', text:'processing'});
            
            // Execute the ffmpeg command in the worker
            node.worker.run(node.command).then(async function() {
                // Process all the output bindings: which means we read the output files from the Emscripten file system 
                // (of the worker where ffmpeg has saved it), and send them in the specified output message fields
                for (var j = 0; j < node.bindings.length; j++) {
                    var binding = node.bindings[j];
                    var dataBuffer;
                    
                    if (binding.direction === "output") {
                        try {
                            const { data } = await node.worker.read(binding.filename);
                                                    
                            // Convert Uint8Array to NodeJs buffer
                            dataBuffer = Buffer.from(data);
                        }
                        catch(error) {
                            node.error("We cannot read the content of output file " + binding.filename + " : " + error);
                            return;
                        }
                        
                        try {
                            RED.util.setMessageProperty(msg, binding.field, dataBuffer, true);
                        }
                        catch(error) {
                            node.error("We cannot send the output binding field msg." + binding.field + " : " + error);
                            return;
                        }
                    }
                }
                
                node.send([msg, null]);

                // Remove all the (input and output) files
                for (var j = 0; j < node.bindings.length; j++) {
                    var binding = node.bindings[j];
                    await node.worker.remove(binding.filename);
                }
            }).catch(function(error) {
                node.error("Error during ffmpeg processing: " + error);
            }).finally(function() {
                node.busy = false;
                node.status({fill:'green', shape:'dot', text:'ready'});
            });
        });
        
        node.on("close", function() { 
            var node = this;
            stopWorker(node);
        });
    }

    RED.nodes.registerType("ffmpeg_wasm", FFmpegWasmNode);
}
