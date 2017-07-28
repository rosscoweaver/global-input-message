import SocketIOClient from "socket.io-client";
import {encrypt,decrypt,generatateRandomString} from "./util";
import {codedataUtil} from "./codedataUtil";


 export default class GlobalInputMessageConnector{
    log(message){
      console.log(this.client+":"+message);
    }
    logError(message){
      console.error(this.client+":"+message);
    }
    constructor(){
        this.apikey="k7jc3QcMPKEXGW5UC";
        this.sessionGroup="1CNbWCFpsbmRQuKdd";
        this.codeAES="LNJGw0x5lqnXpnVY8";
        this.session=generatateRandomString(17);
        this.client=generatateRandomString(17);
        this.aes=generatateRandomString(17);
        this.socket=null;
        this.connectedSenders=[];
        this.url="https://globalinput.co.uk";
    }

    isConnected(){
      return this.socket!=null;
    }
    disconnect(){
        if(this.socket){
          this.socket.disconnect();
          this.socket=null;
        }
        this.targetSession=null;
    }
    setCodeAES(codeAES){
      this.codeAES=codeAES;
    }
    connect(options={}){
        this.disconnect();

         if(options.apikey){
              this.apikey=options.apikey;
         }
         if(options.sessionGroup){
           this.sessionGroup=options.sessionGroup;
         }
         if(options.client){
           this.client=options.client;
         }

          if(options.url){
            this.url=options.url;
          }
          this.log("connecting to:"+this.url);
          this.socket=SocketIOClient(this.url);
          const that=this;
          this.socket.on("registerPermission", function(data){
                 that.log("registerPermission message is received:"+data);
                  that.onRegisterPermission(JSON.parse(data), options);
          });
          this.log("connection process complete, will for permisstion to register");
    }
    onRegisterPermission(registerPermistion, options){
         if(registerPermistion.result==="ok"){
                 var that=this;
                 this.socket.on("registered", function(data){
                         that.log("received the registered message:"+data);
                         var registeredMessage=JSON.parse(data);
                         if(registeredMessage.result==="ok"){
                               if(options.onRegistered){
                                  options.onRegistered(function(){
                                      that.onRegistered(registeredMessage,options);
                                  },registeredMessage,options);
                               }
                               else{
                                    that.onRegistered(registeredMessage,options);
                               }
                         }
                         else{
                           if(options.onRegisterFailed){
                             options.onRegisterFailed();
                           }
                         }

                 });
                 const registerMessage={
                       sessionGroup:this.sessionGroup,
                       session:this.session,
                       client:this.client,
                       apikey:this.apikey
                 };
                 this.log("sending register message");
                 this.socket.emit("register", JSON.stringify(registerMessage));
         }
         else{
                this.log("failed to get register permission");
         }


    }


    onRegistered(registeredMessage, options){
            var that=this;
            this.socket.on(this.session+"/inputPermission", function(data){
                that.log("inputPermission message is received:"+data);

                that.processInputPermission(JSON.parse(data), options);
            });
            if(options.connectSession){
                    that.socket.on(options.connectSession+"/inputPermissionResult", function(data){
                    that.log("inputPermissionResult is received "+data);
                    that.onInputPermissionResult(JSON.parse(data),options);
                    });
                    const requestInputPermissionMessage={
                          sessionGroup:that.sessionGroup,
                          session:that.session,
                          client:that.client,
                          connectSession:options.connectSession
                    };
                    requestInputPermissionMessage.data={
                        client:that.client,
                        time:(new Date()).getTime()
                    };
                    requestInputPermissionMessage.data=JSON.stringify(requestInputPermissionMessage.data);
                    if(options.aes){
                           requestInputPermissionMessage.data=encrypt(requestInputPermissionMessage.data,options.aes);
                    }


                    const data=JSON.stringify(requestInputPermissionMessage)
                    this.log("sending the requestInputPermissionMessage:"+data);
                    this.socket.emit("inputPermision",data);
            }

    }
    processInputPermission(inputPermissionMessage,options){
            if(!inputPermissionMessage.data){
              this.sendInputPermissionDeniedMessage(inputPermissionMessage,"data is missing in the permision request");
              return;
          }
          try{
                inputPermissionMessage.data=decrypt(inputPermissionMessage.data,this.aes);
            }
            catch(error){
              this.log(error+" while decrypting the data in the permission request:"+inputPermissionMessage.data);
              this.sendInputPermissionDeniedMessage(inputPermissionResult,"failed to decrypt");
              return;
            }
          if(!inputPermissionMessage.data){
            this.log(" failed to decrypt the data in the permission request");
            this.sendInputPermissionDeniedMessage(inputPermissionMessage,"failed to decrypt");
            return;
          }
          try{
                inputPermissionMessage.data=JSON.parse(inputPermissionMessage.data);
          }
          catch(error){
              this.log(error+" while parsing the json data in the permisson request");
              this.sendInputPermissionDeniedMessage(inputPermissionMessage,"data format error in the permisson request");
              return;
          }
          if(inputPermissionMessage.data.client!==inputPermissionMessage.client){
            this.log("***the client id mis match in the permission");
            this.sendInputPermissionDeniedMessage(inputPermissionMessage,"client id mismatch");
            return;
          }
          var that=this;
          if(options.onInputPermission){
              options.onInputPermission(function(){
                  that.grantInputPermission(inputPermissionMessage,options);
              },function(){
                that.sendInputPermissionDeniedMessage(inputPermissionResult,"application denied to give permission");
              },inputPermissionMessage,options);
          }
          else{
              this.grantInputPermission(inputPermissionMessage,options);
          }

    }


    grantInputPermission(inputPermissionMessage,options){
      var existingSameSenders=this.connectedSenders.filter(s=>s.client===inputPermissionMessage.client);
      if(existingSameSenders.length>0){
          this.log("the client is already connected");
          return;
      }
      const inputSender=this.buildInputSender(inputPermissionMessage,options);
      this.connectedSenders.push(inputSender);
      if(options.onSenderConnected){
                      options.onSenderConnected(inputSender, this.connectedSenders);
      }
      this.socket.on(this.session+"/input", inputSender.onInput);
      this.socket.on(this.session+"/leave",inputSender.onLeave);
      this.sendInputPermissionGrantedMessage(inputPermissionMessage, options);
    }
    sendInputPermissionGrantedMessage(inputPermissionMessage,options){

      var inputPermissionResult=Object.assign({},inputPermissionMessage);
      if(options.metadata){
              inputPermissionResult.metadata=options.metadata;
              if(this.aes){
                  inputPermissionResult.metadata=encrypt(JSON.stringify(options.metadata),this.aes);
              }
      }
      inputPermissionResult.allow=true;
      this.sendInputPermissionResult(inputPermissionResult);
    }
    sendInputPermissionDeniedMessage(inputPermissionMessage,reason){
      inputPermissionMessage.allow=false;
      inputPermissionMessage.reason=reason;
      this.sendInputPermissionResult(inputPermissionMessage);
    }
    sendInputPermissionResult(inputPermissionResult){
      var data=JSON.stringify(inputPermissionResult);
      this.log("sending the inputPermissionResult  message:"+data);
      this.socket.emit(this.session+"/inputPermissionResult",data);
    }

    onInputPermissionResult(inputPermissionResultMessage, options){
            this.connectSession=options.connectSession;
            this.inputAES=options.aes;
            if(this.inputAES && inputPermissionResultMessage.metadata && typeof inputPermissionResultMessage.metadata ==="string"){
                   const descryptedMetadata=decrypt(inputPermissionResultMessage.metadata,this.inputAES);
                   this.log("decrypted metadata:"+descryptedMetadata);
                  inputPermissionResultMessage.metadata=JSON.parse(descryptedMetadata);
            }
            else{
                  this.log("received metadata is not encrypted");
            }


            if(options.onInputPermissionResult){
              options.onInputPermissionResult(inputPermissionResultMessage);
            }
            var receveiverDisconnected=function(){
                 console.log("the receiver disconnected");
                 if(options.onReceiverDisconnected){
                   options.onReceiverDisconnected();
                 }
            }
            if(this.socket){
                this.socket.on(options.connectSession+"/leave",receveiverDisconnected);
            }

    }

    buildInputSender(inputPermissionMessage,options){
      var that=this;
      var inputSender={
        client:inputPermissionMessage.client,
        session:inputPermissionMessage.session,
        onInput:function(data){
            that.log("input message received:"+data);
            if(options.onInput){
                const inputMessage=JSON.parse(data);
                if(inputMessage.client===that.client){
                    that.log("input message is coming from itself:"+data);
                  }
                else{

                    if(that.aes && inputMessage.data && typeof inputMessage.data ==="string"){
                          var dataDecrypted=null;
                          try{
                            dataDecrypted=decrypt(inputMessage.data,that.aes);
                          }
                          catch(error){
                              that.logError(error+", failed to decrypt the input content with:"+that.aes);
                              return;
                          }
                          if(!dataDecrypted){
                            that.logError("failed to decrypt the content with:"+that.aes);
                            return;
                          }

                          that.log("decrypted inputdata is:"+dataDecrypted);
                          try{
                              inputMessage.data=JSON.parse(dataDecrypted);
                          }
                          catch(error){
                            that.logError(error+"failed to parse the decrypted input content:"+dataDecrypted)
                          }

                    }
                    else{
                      that.log("received input data is not encrypted");
                    }

                    options.onInput(inputMessage);
                  }

              }

         },
         onLeave:function(data){
             that.log("leave request is received:"+data);
             const leaveMessage=JSON.parse(data);
             const matchedSenders=that.connectedSenders.filter(s =>s.client===leaveMessage.client);
             if(matchedSenders.length>0){
               const inputSenderToLeave=matchedSenders[0];
               that.socket.removeListener(that.session+"/input",inputSenderToLeave.onInput);
               that.socket.removeListener(that.session+"/leave",inputSenderToLeave.onLeave);
               that.connectedSenders=that.connectedSenders.filter(s =>s.client!==leaveMessage.client);
               that.log("sender is removed:"+that.connectedSenders.size);
               if(options.onSenderDisconnected){
                       options.onSenderDisconnected(inputSenderToLeave, that.connectedSenders);
               }

             }

         }
      };
      return inputSender;
    }





   sendInputMessage(data){
      if(!this.isConnected()){
           this.log("not connected yet");
           return;
      }

      var message={
          client:this.client,
          session:this.session,
          connectSession:this.connectSession,
          data
      }
      if(this.inputAES){
          const contentToEncrypt=JSON.stringify(message.data);
          this.log("content to be encrypted:"+contentToEncrypt);
          const contentEcrypted=encrypt(contentToEncrypt,this.inputAES);
          this.log("content encrypted:"+contentEcrypted);
          message.data=contentEcrypted;
      }

       const content=JSON.stringify(message);
       this.log("sending input message  to:"+this.connectSession+" content:"+content);
       this.socket.emit(this.connectSession+'/input', content);


   }
   sendMetadata(metadata){
     if(!this.isConnected()){
          this.log("not connected yet");
          return;
     }
     if(metadata && this.aes){
         metadata=encrypt(JSON.stringify(metadata),this.aes);
     }

     var message={
         client:this.client,
         connectSession:this.connectSession,
         metadata
     }
     const content=JSON.stringify(message);
     this.log("sending metdata message  to:"+this.connectSession+" content:"+content);
     this.socket.emit(this.connectSession+'/metadata', content);
   }


   sendGlobalInputFieldData(globalInputdata,index, value){
      if(!globalInputdata){
           console.log("ignored:"+index+":"+value+" because globalInputdata is empty");
           return globalInputdata;
      }
      if(globalInputdata.length<=index){
        console.error("reeived the data index is bigger that that of metadata");
        return globalInputdata;
      }
       var globalInputdata=globalInputdata.slice(0);
       console.log("setting index:"+index+"value:"+value);
       globalInputdata[index].value=value;
       var message={
            id:generatateRandomString(10),
            value,
            index
          };
      this.sendInputMessage(message);
      return globalInputdata;
  }
  onReiceveGlobalInputFieldData(inputMessage, metadata){
      console.log("received the input message:"+inputMessage);
      console.log("received the input message:"+inputMessage);
      if(metadata.fields){
          if(inputMessage.data.index<metadata.fields.length){
                metadata.fields[inputMessage.data.index].onInput(inputMessage.data.value);
          }
          else{
            console.error("the index of the data in the input message is bigger than the fields in the medata");
            return;
          }
      }
      else {
          consoler.error("the medata should have fields data");
      }
  }

  buildOptionsFromInputCodedata(codedata, options){
        return codedataUtil.buildOptionsFromInputCodedata(this,codedata,options);
  }
  buildInputCodeData(data={}){
        return codedataUtil.buildInputCodeData(this,data);
  }
  buildAPIKeyCodeData(data={}){
        return codedataUtil.buildAPIKeyCodeData(this,data);
  }
  buildSessionGroupCodeData(data={}){
      return codedataUtil.buildSessionGroupCodeData(this,data);
  }
  buildCodeAESCodeData(data={}){
      return codedataUtil.buildCodeAESCodeData(this,data)
  }
  processCodeData(encryptedcodedata, options){
      return codedataUtil.processCodeData(this,encryptedcodedata,options);
  }

}
