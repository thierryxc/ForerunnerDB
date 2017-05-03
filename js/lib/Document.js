"use strict";
// TODO: Remove the _update* methods because we are already mixing them
// TODO: in now via Mixin.Updating and update autobind to extend the _update*
// TODO: methods like we already do with collection
var Shared,
	Collection,
	Overload,
	Db,
	Path;

Shared = require('./Shared');

/**
 * Creates a new Document instance. Documents allow you to create individual
 * objects that can have standard ForerunnerDB CRUD operations run against
 * them, as well as data-binding if the AutoBind module is included in your
 * project.
 * @name Document
 * @class Document
 * @constructor
 */
var FdbDocument = function () {
	this.init.apply(this, arguments);
};

FdbDocument.prototype.init = function (name) {
	this._name = name;
	this._data = {};
};

Shared.addModule('Document', FdbDocument);
Shared.mixin(FdbDocument.prototype, 'Mixin.Common');
Shared.mixin(FdbDocument.prototype, 'Mixin.Events');
Shared.mixin(FdbDocument.prototype, 'Mixin.ChainReactor');
Shared.mixin(FdbDocument.prototype, 'Mixin.Constants');
Shared.mixin(FdbDocument.prototype, 'Mixin.Triggers');
Shared.mixin(FdbDocument.prototype, 'Mixin.Matching');
Shared.mixin(FdbDocument.prototype, 'Mixin.Updating');
Shared.mixin(FdbDocument.prototype, 'Mixin.Tags');

Overload = require('./Overload');
Collection = require('./Collection');
Db = Shared.modules.Db;
Path = require('./Path');

/**
 * Gets / sets the current state.
 * @func state
 * @memberof Document
 * @param {String=} val The name of the state to set.
 * @returns {*}
 */
Shared.synthesize(FdbDocument.prototype, 'state');

/**
 * Gets / sets the db instance this class instance belongs to.
 * @func db
 * @memberof Document
 * @param {Db=} db The db instance.
 * @returns {*}
 */
Shared.synthesize(FdbDocument.prototype, 'db');

/**
 * Gets / sets the document name.
 * @func name
 * @memberof Document
 * @param {String=} val The name to assign
 * @returns {*}
 */
Shared.synthesize(FdbDocument.prototype, 'name');

/**
 * Sets the data for the document.
 * @func setData
 * @memberof Document
 * @param data
 * @param options
 * @returns {Document}
 */
FdbDocument.prototype.setData = function (data, options) {
	var i,
		eventData,
		$unset;

	if (data) {
		options = options || {
			$decouple: true
		};

		if (options && options.$decouple === true) {
			data = this.decouple(data);
		}

		if (this._linked) {
			$unset = {};

			// Remove keys that don't exist in the new data from the current object
			for (i in this._data) {
				if (i.substr(0, 6) !== 'jQuery' && this._data.hasOwnProperty(i)) {
					// Check if existing data has key
					if (data[i] === undefined) {
						// Add property name to those to unset
						$unset[i] = 1;
					}
				}
			}

			data.$unset = $unset;

			// Now update the object with new data
			this.updateObject(this._data, data, {});
		} else {
			// Straight data assignment
			this._data = data;
		}
		
		eventData = {type: 'setData', data: this.decouple(this._data)};
		
		this.emit('immediateChange', eventData);
		this.deferEmit('change', eventData);
	}

	return this;
};

/**
 * Gets the document's data returned as a single object.
 * @func find
 * @memberof Document
 * @param {Object} query The query object - currently unused, just
 * provide a blank object e.g. {}
 * @param {Object=} options An options object.
 * @returns {Object} The document's data object.
 */
FdbDocument.prototype.find = function (query, options) {
	var result;

	if (options && options.$decouple === false) {
		result = this._data;
	} else {
		result = this.decouple(this._data);
	}

	return result;
};

/**
 * Finds sub-documents in this document.
 * @param {Object} match A query to check if this document should
 * be queried. If this document data doesn't match the query then
 * no results are returned.
 * @param {String} path The path string used to identify the
 * key in which sub-documents are stored in the parent document.
 * @param {Object=} subDocQuery The query to use when matching
 * which sub-documents to return.
 * @param {Object=} subDocOptions The options object to use
 * when querying for sub-documents.
 * @returns {*}
 */
FdbDocument.prototype.findSub = function (match, path, subDocQuery, subDocOptions) {
	return this._findSub([this.find(match)], path, subDocQuery, subDocOptions);
};

FdbDocument.prototype._findSub = function (docArr, path, subDocQuery, subDocOptions) {
	var pathHandler = new Path(path),
		docCount = docArr.length,
		docIndex,
		subDocArr,
		subDocCollection = new Collection('__FDB_temp_' + this.objectId()).db(this._db),
		subDocResults,
		resultObj = {
			parents: docCount,
			subDocTotal: 0,
			subDocs: [],
			pathFound: false,
			err: ''
		};
	
	subDocOptions = subDocOptions || {};
	
	for (docIndex = 0; docIndex < docCount; docIndex++) {
		subDocArr = pathHandler.value(docArr[docIndex])[0];
		if (subDocArr) {
			subDocCollection.setData(subDocArr);
			subDocResults = subDocCollection.find(subDocQuery, subDocOptions);
			if (subDocOptions.returnFirst && subDocResults.length) {
				return subDocResults[0];
			}
			
			if (subDocOptions.$split) {
				resultObj.subDocs.push(subDocResults);
			} else {
				resultObj.subDocs = resultObj.subDocs.concat(subDocResults);
			}
			
			resultObj.subDocTotal += subDocResults.length;
			resultObj.pathFound = true;
		}
	}
	
	// Drop the sub-document collection
	subDocCollection.drop();
	
	if (!resultObj.pathFound) {
		resultObj.err = 'No objects found in the parent documents with a matching path of: ' + path;
	}
	
	// Check if the call should not return stats, if so return only subDocs array
	if (subDocOptions.$stats) {
		return resultObj;
	} else {
		return resultObj.subDocs[0];
	}
};

/**
 * Modifies the document. This will update the document with the data held in 'update'.
 * @func update
 * @memberof Document
 * @param {Object} query The query that must be matched for a document to be
 * operated on.
 * @param {Object} update The object containing updated key/values. Any keys that
 * match keys on the existing document will be overwritten with this data. Any
 * keys that do not currently exist on the document will be added to the document.
 * @param {Object=} options An options object.
 * @returns {Array} The items that were updated.
 */
FdbDocument.prototype.update = function (query, update, options) {
	var result = this.updateObject(this._data, update, query, options),
		eventData;

	if (result) {
		eventData = {type: 'update', data: this.decouple(this._data)};
		
		this.emit('immediateChange', eventData);
		this.deferEmit('change', eventData);
	}
};

/**
 * Internal method for document updating.
 * @func updateObject
 * @memberof Document
 * @param {Object} doc The document to update.
 * @param {Object} update The object with key/value pairs to update the document with.
 * @param {Object} query The query object that we need to match to perform an update.
 * @param {Object} options An options object.
 * @param {String} path The current recursive path.
 * @param {String} opType The type of update operation to perform, if none is specified
 * default is to set new data against matching fields.
 * @returns {Boolean} True if the document was updated with new / changed data or
 * false if it was not updated because the data was the same.
 * @private
 */
FdbDocument.prototype.updateObject = Collection.prototype.updateObject;

/**
 * Determines if the passed key has an array positional mark (a dollar at the end
 * of its name).
 * @func _isPositionalKey
 * @memberof Document
 * @param {String} key The key to check.
 * @returns {Boolean} True if it is a positional or false if not.
 * @private
 */
FdbDocument.prototype._isPositionalKey = function (key) {
	return key.substr(key.length - 2, 2) === '.$';
};

/**
 * Updates a property on an object depending on if the collection is
 * currently running data-binding or not.
 * @func _updateProperty
 * @memberof Document
 * @param {Object} doc The object whose property is to be updated.
 * @param {String} prop The property to update.
 * @param {*} val The new value of the property.
 * @private
 */
FdbDocument.prototype._updateProperty = function (doc, prop, val) {
	if (this._linked) {
		window.jQuery.observable(doc).setProperty(prop, val);

		if (this.debug()) {
			console.log(this.logIdentifier() + ' Setting data-bound document property "' + prop + '"');
		}
	} else {
		doc[prop] = val;

		if (this.debug()) {
			console.log(this.logIdentifier() + ' Setting non-data-bound document property "' + prop + '" to val "' + val + '"');
		}
	}
};

/**
 * Increments a value for a property on a document by the passed number.
 * @func _updateIncrement
 * @memberof Document
 * @param {Object} doc The document to modify.
 * @param {String} prop The property to modify.
 * @param {Number} val The amount to increment by.
 * @private
 */
FdbDocument.prototype._updateIncrement = function (doc, prop, val) {
	if (this._linked) {
		window.jQuery.observable(doc).setProperty(prop, doc[prop] + val);
	} else {
		doc[prop] += val;
	}
};

/**
 * Changes the index of an item in the passed array.
 * @func _updateSpliceMove
 * @memberof Document
 * @param {Array} arr The array to modify.
 * @param {Number} indexFrom The index to move the item from.
 * @param {Number} indexTo The index to move the item to.
 * @private
 */
FdbDocument.prototype._updateSpliceMove = function (arr, indexFrom, indexTo) {
	if (this._linked) {
		window.jQuery.observable(arr).move(indexFrom, indexTo);

		if (this.debug()) {
			console.log(this.logIdentifier() + ' Moving data-bound document array index from "' + indexFrom + '" to "' + indexTo + '"');
		}
	} else {
		arr.splice(indexTo, 0, arr.splice(indexFrom, 1)[0]);

		if (this.debug()) {
			console.log(this.logIdentifier() + ' Moving non-data-bound document array index from "' + indexFrom + '" to "' + indexTo + '"');
		}
	}
};

/**
 * Inserts an item into the passed array at the specified index.
 * @func _updateSplicePush
 * @memberof Document
 * @param {Array} arr The array to insert into.
 * @param {Number} index The index to insert at.
 * @param {Object} doc The document to insert.
 * @private
 */
FdbDocument.prototype._updateSplicePush = function (arr, index, doc) {
	if (arr.length > index) {
		if (this._linked) {
			window.jQuery.observable(arr).insert(index, doc);
		} else {
			arr.splice(index, 0, doc);
		}
	} else {
		if (this._linked) {
			window.jQuery.observable(arr).insert(doc);
		} else {
			arr.push(doc);
		}
	}
};

/**
 * Inserts an item at the end of an array.
 * @func _updatePush
 * @memberof Document
 * @param {Array} arr The array to insert the item into.
 * @param {Object} doc The document to insert.
 * @private
 */
FdbDocument.prototype._updatePush = function (arr, doc) {
	if (this._linked) {
		window.jQuery.observable(arr).insert(doc);
	} else {
		arr.push(doc);
	}
};

/**
 * Removes an item from the passed array.
 * @func _updatePull
 * @memberof Document
 * @param {Array} arr The array to modify.
 * @param {Number} index The index of the item in the array to remove.
 * @private
 */
FdbDocument.prototype._updatePull = function (arr, index) {
	if (this._linked) {
		window.jQuery.observable(arr).remove(index);
	} else {
		arr.splice(index, 1);
	}
};

/**
 * Multiplies a value for a property on a document by the passed number.
 * @func _updateMultiply
 * @memberof Document
 * @param {Object} doc The document to modify.
 * @param {String} prop The property to modify.
 * @param {Number} val The amount to multiply by.
 * @private
 */
FdbDocument.prototype._updateMultiply = function (doc, prop, val) {
	if (this._linked) {
		window.jQuery.observable(doc).setProperty(prop, doc[prop] * val);
	} else {
		doc[prop] *= val;
	}
};

/**
 * Renames a property on a document to the passed property.
 * @func _updateRename
 * @memberof Document
 * @param {Object} doc The document to modify.
 * @param {String} prop The property to rename.
 * @param {Number} val The new property name.
 * @private
 */
FdbDocument.prototype._updateRename = function (doc, prop, val) {
	var existingVal = doc[prop];
	if (this._linked) {
		window.jQuery.observable(doc).setProperty(val, existingVal);
		window.jQuery.observable(doc).removeProperty(prop);
	} else {
		doc[val] = existingVal;
		delete doc[prop];
	}
};

/**
 * Deletes a property on a document.
 * @func _updateUnset
 * @memberof Document
 * @param {Object} doc The document to modify.
 * @param {String} prop The property to delete.
 * @private
 */
FdbDocument.prototype._updateUnset = function (doc, prop) {
	if (this._linked) {
		window.jQuery.observable(doc).removeProperty(prop);
	} else {
		delete doc[prop];
	}
};

/**
 * Drops the document.
 * @func drop
 * @memberof Document
 * @returns {boolean} True if successful, false if not.
 */
FdbDocument.prototype.drop = function (callback) {
	if (!this.isDropped()) {
		if (this._db && this._name) {
			if (this._db && this._db._document && this._db._document[this._name]) {
				this._state = 'dropped';

				delete this._db._document[this._name];
				delete this._data;

				this.emit('drop', this);

				if (callback) { callback(false, true); }

				delete this._listeners;

				return true;
			}
		}
	} else {
		return true;
	}

	return false;
};

Db.prototype.document = new Overload('Db.prototype.document', {
	/**
	 * Get a document with no name (generates a random name). If the
	 * document does not already exist then one is created for that
	 * name automatically.
	 * @name document
	 * @method Db.document
	 * @func document
	 * @memberof Db
	 * @returns {Document}
	 */
	'': function () {
		return this.$main.call(this, {
			name: this.objectId()
		});
	},
	
	/**
	 * Get a document by name. If the document does not already exist
	 * then one is created for that name automatically.
	 * @name document
	 * @method Db.document
	 * @func document
	 * @memberof Db
	 * @param {Object} data An options object or a document instance.
	 * @returns {Document}
	 */
	'object': function (data) {
		// Handle being passed an instance
		if (data instanceof FdbDocument) {
			if (data.state() !== 'droppped') {
				return data;
			} else {
				return this.$main.call(this, {
					name: data.name()
				});
			}
		}
		
		return this.$main.call(this, data);
	},
	
	/**
	 * Get a document by name. If the document does not already exist
	 * then one is created for that name automatically.
	 * @name document
	 * @method Db.document
	 * @func document
	 * @memberof Db
	 * @param {String} documentName The name of the document.
	 * @returns {Document}
	 */
	'string': function (documentName) {
		return this.$main.call(this, {
			name: documentName
		});
	},
	
	/**
	 * Get a document by name. If the document does not already exist
	 * then one is created for that name automatically.
	 * @name document
	 * @method Db.document
	 * @func document
	 * @memberof Db
	 * @param {String} documentName The name of the document.
	 * @param {Object} options An options object.
	 * @returns {Document}
	 */
	'string, object': function (documentName, options) {
		options.name = documentName;
		
		return this.$main.call(this, options);
	},
	
	'$main': function (options) {
		var self = this,
			name = options.name;
		
		if (!name) {
			if (!options || (options && options.throwError !== false)) {
				throw(this.logIdentifier() + ' Cannot get document with undefined name!');
			}
			
			return;
		}
		
		if (this._document && this._document[name]) {
			return this._document[name];
		}
		
		if (options && options.autoCreate === false) {
			if (options && options.throwError !== false) {
				throw(this.logIdentifier() + ' Cannot get document ' + name + ' because it does not exist and auto-create has been disabled!');
			}
			
			return undefined;
		}
		
		if (this.debug()) {
			console.log(this.logIdentifier() + ' Creating document ' + name);
		}
		
		this._document = this._document || {};
		this._document[name] = this._document[name] || new FdbDocument(name, options).db(this);
		
		// Listen for events on this document so we can fire global events
		// on the database in response to it
		self._document[name].on('change', function () {
			self.emit('change', self._document[name], 'document', name);
		});
		
		self.deferEmit('create', self._document[name], 'document', name);
		
		return this._document[name];
	}
});

/**
 * Returns an array of documents the DB currently has.
 * @func documents
 * @memberof Db
 * @returns {Array} An array of objects containing details of each document
 * the database is currently managing.
 */
Db.prototype.documents = function () {
	var arr = [],
		item,
		i;

	for (i in this._document) {
		if (this._document.hasOwnProperty(i)) {
			item = this._document[i];

			arr.push({
				name: i,
				linked: item.isLinked !== undefined ? item.isLinked() : false
			});
		}
	}

	return arr;
};

Shared.finishModule('Document');
module.exports = FdbDocument;