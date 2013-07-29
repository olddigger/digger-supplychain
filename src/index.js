/*

  (The MIT License)

  Copyright (C) 2005-2013 Kai Davenport

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

 */


/*

	supply chain

  the link between a client side container and a back end digger.io database server

  the supplychain is a function that accepts a request object (a pure javascript obj)
  and returns a promise for it to be fulfilled

  you create a supplychain by passing the function that will actualy deal with the request

	
*/

var Container = require('digger-container');
var Q = require('q');
var EventEmitter = require('events').EventEmitter;
var util = require('util');


module.exports = factory;

function factory(handle){

  var supplychain = new SupplyChain(handle);

  return supplychain;
}

/*

  create a new supply chain that will pipe a req and res object into the
  provided fn

  
*/

function SupplyChain(handle){
  this.handle = handle;
}


util.inherits(SupplyChain, EventEmitter);

/*

  the handler function accepts a pure JS req object to be sent to the server as HTTP or socket (but it's basically a HTTP)

  it returns a promise that will resolve once the callback based handle function passed in to the supplychain has returned
  
*/
SupplyChain.prototype.contract = function(req, results_processor){

  var self = this;

  var loadresults = Q.defer();

  function trigger_request(){
    if(!self.handle || typeof(self.handle)!='function'){
      setTimeout(function(){
        loadresults.reject('There is no handle method attached to this supplychain')
      }, 0)
    }
    else{
      self.handle(req, function(error, result){
        var sendresult = result;
      
        if(results_processor){
          sendresult = results_processor(result);
        }

        if(error){
          loadresults.reject(error);
        }
        else{
          loadresults.resolve({
            result:sendresult,
            response:result
          })
        }
      })
    }
  }

  var promise = loadresults.promise;
  
  /*
  
    we are basically wrapping the .then method of a promise here
    but intercepting the results
    
  */
  loadresults.contract = req;
  req.ship = function(fn){
    promise
      .then(function(answer){
        if(fn){
          fn(answer.result, answer.response);
        }
      })
    process.nextTick(function(){
      trigger_request();
    })
    return this;
  }
  req.error = function(fn){
    promise.error(fn);
  }
  return req;

}

/*

  return a container that uses this supplychain - this means contracts can be run via the container
  and they will travel down the supply chain

  if a diggerid is given then the returned container will not be a _supplychain - this means it's skeleton will
  be sent for selects

  otherwise we are assuming the connect is for a top level warehouse and the tag becomes _supplychain which
  is filtered out from the skeleton in contracts
  
*/
SupplyChain.prototype.connect = function(diggerwarehouse, diggerid){
  var container = Container(arguments.length>1 ? 'item' : '_supplychain');
  container.diggerwarehouse(diggerwarehouse || '/');
  if(arguments.length>1){
    container.diggerid(diggerid);
  }
  container.supplychain = this;
  return container;
}

SupplyChain.prototype.contract_group = function(type, contracts){
  var raw = {
    method:'post',
    url:'/reception',
    headers:{
      'content-type':'digger/contract',
      'x-contract-type':type
    },
    body:contracts || []
  }

  return this.contract(raw);
}

/*

  create a merge contract from an array of existing contracts
  
*/
SupplyChain.prototype.merge = function(contracts){
  return this.contract_group('merge', contracts);
}

/*

  create a pipe contract from an array of existing contracts
  
*/
SupplyChain.prototype.pipe = function(contracts){
  return this.contract_group('pipe', contracts);
}