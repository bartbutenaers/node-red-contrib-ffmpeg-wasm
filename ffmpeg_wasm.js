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
    
    function FFmpegWasmNode(config) {
        RED.nodes.createNode(this, config);
        this.command    = config.command;
        this.bindings   = config.bindings;
        this.wasmLoaded = false;
        this.busy       = false;

        var node = this;
        
        // When the command starts with "ffmpeg " then remove that part of the command
        node.command = node.command.replace(/^ffmpeg /,"");
        
        node.status({fill:'yellow', shape:'ring', text:'loading ...'});
        
        if (!node.worker) {
            // Create an ffmpeg worker (i.e. a child process in NodeJs).
            node.worker = createWorker();

            // It takes some time to load the wasm
            node.worker.load().then(function() {
                node.wasmLoaded = true;
                node.status({fill:'green', shape:'dot', text:'ready'});
            });
        }
        else {
            console.log("node.worker was already loaded");
        }

        node.on("input", async function(msg) {
            var inputImage = msg.payload;
            
            if (!node.worker) {
                node.warn("Ignore input message since the worker is not available yet");
                return;
            }
            
            if (!node.wasmLoaded) {
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
                
                node.send(msg);

                // TODO should we remove the files ???????       
            }).catch(function(error) {
                node.error("Error during ffmpeg processing: " + error);
            }).finally(function() {
                node.busy = false;
                node.status({fill:'green', shape:'dot', text:'ready'});
            });
        });
        
        node.on("close", function() { 
            var node = this;
            
            if (node.worker) {
                debugger;
                node.worker.terminate().then(function() {
                    node.status({fill:'orange', shape:'dot', text:'terminated'});
                }).catch(function(error) {
                    node.error("Error when closing worker: " + error);
                    node.status({fill:'orange', shape:'dot', text:'termination failed'});
                }).finally(function() {
                    node.busy = false;
                    node.wasmLoaded = false;
                });
            }
            node.status({});
        });
    }

    RED.nodes.registerType("ffmpeg_wasm", FFmpegWasmNode);
}
