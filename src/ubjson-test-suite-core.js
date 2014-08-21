﻿'use strict';

var UbjsonTestSuiteCore = (function (core) {

//------------------------------------------------------------------------------

    var Types = {
        Null: 'Z',
        Noop: 'N',
        True: 'T',
        False: 'F',
        Int8: 'i',
        UInt8: 'U',
        Int16: 'I',
        Int32: 'l',
        Int64: 'L',
        Float32: 'd',
        Float64: 'D',
        HighNumber: 'H',
        Char: 'C',
        String: 'S',
        ArrayBegin: '[',
        ArrayEnd: ']',
        ObjectBegin: '{',
        ObjectEnd: '}',
        Type: '$',
        Count: '#'
    };

    var MinInt8 = -128;
    var MaxInt8 = 127;
    var MinUInt8 = 0;
    var MaxUInt8 = 255;
    var MinInt16 = -32768;
    var MaxInt16 = 32767;
    var MinInt32 = -2147483648;
    var MaxInt32 = 2147483647;
    var MinInt64 = -9223372036854775808;
    var MaxInt64 = 9223372036854775807;
    var MinFloat32 = -3.402823e38;
    var MaxFloat32 = 3.402823e+38;
    var MinFloat64 = -1.7976931348623157E+308;
    var MaxFloat64 = 1.7976931348623157E+308;

    var Semantics = {
        Markup: 1,
        Key: 2,
        Value: 3,
        ArrayItem: 4,
        LowValuesMask: 0xFF,
        LastArrayItemFlag: 0x100
    };

//------------------------------------------------------------------------------

    function utf8encode(string) {
        return unescape(encodeURIComponent(string));
    }

    function isInteger(number) {
        return isFinite(number) &&
            number > -9007199254740992 &&
            number < 9007199254740992 &&
            Math.floor(number) === number;
    };

    function findSuitableNumericType(number) {
        if (isInteger(number)) {
            if (number >= MinInt8 && number <= MaxInt8)
                return Types.Int8;

            if (number >= MinUInt8 && number <= MaxUInt8)
                return Types.UInt8;

            if (number >= MinInt16 && number <= MaxInt16)
                return Types.Int16;

            if (number >= MinInt32 && number <= MaxInt32)
                return Types.Int32;

            if (number >= MinInt64 && number <= MaxInt64)
                return Types.Int64;
        } else {
            if (number >= MinFloat32 && number <= MaxFloat32)
                return Types.Float32;

            if (number >= MinFloat64 && number <= MaxFloat64)
                return Types.Float64;
        }
        return Types.HighNumber;
    }

//------------------------------------------------------------------------------

    function BlockItem() {
    }

    BlockItem.prototype.displayValue = null;

    BlockItem.prototype.toString = function() {
        return 'semantic: ' + this.semantic + ', type: ' + this.type;
    }

    function DataItem(semantic, type, value) {
        this.semantic = semantic;
        this.type = type;
        this.value = value;
    }

    DataItem.prototype = new BlockItem();
    DataItem.prototype.constructor = DataItem;

    function TagItem(semantic, type) {
        this.semantic = semantic;
        this.type = type;
    }

    TagItem.prototype = new BlockItem();
    TagItem.prototype.constructor = TagItem;

//------------------------------------------------------------------------------

    function ObjectSerializer() {
        this.items = [];
        this.currentSemantic = Semantics.Markup;
    }

    ObjectSerializer.prototype.serialize = function(rootObject) {
        this.items = [];
        if (rootObject instanceof Object) {
            this.serializeEntity(rootObject);
        } else {
            throw new Error('Root object must be an Array or Object instance');
        }
        return this.items;
    }

    ObjectSerializer.prototype.serializeEntity = function(entity) {
        if (entity == null) {
            this.addTagItem(Types.Null);
            return;
        }
        switch(typeof(entity)) {
            case 'object':
                if (entity instanceof Array) {
                    this.serializeArray(entity);
                } else {
                    this.serializeObject(entity);
                }
                break;
            case 'string':
                this.serializeString(entity, true, true);
                break;
            case 'number':
                this.serializeNumber(entity);
                break;
            case 'boolean':
                this.serializeBoolean(entity);
                break;
            default:
                throw new Error('Unknown type "' + typeof(entity) + '"');
        }
    }

    ObjectSerializer.prototype.serializeArray = function(array) {
        this.setCurrentSemantic(Semantics.Markup);
        this.addTagItem(Types.ArrayBegin);
        var count = array.length;
        for(var i = 0; i < count; i++) {
            this.setCurrentSemantic(Semantics.ArrayItem);
            this.serializeEntity(array[i]);
            this.items[this.items.length - 1].semantic |= Semantics.LastArrayItemFlag;
        }
        this.setCurrentSemantic(Semantics.Markup);
        this.addTagItem(Types.ArrayEnd);
    }

    ObjectSerializer.prototype.serializeObject = function(object) {
        this.setCurrentSemantic(Semantics.Markup);
        this.addTagItem(Types.ObjectBegin);
        var keys = Object.keys(object);
        var count = keys.length;
        for(var i = 0; i < count; i++) {
            var key = keys[i];
            this.setCurrentSemantic(Semantics.Key);
            this.serializeString(key, false, false);
            this.setCurrentSemantic(Semantics.Value);
            this.serializeEntity(object[key]);
        }
        this.setCurrentSemantic(Semantics.Markup);
        this.addTagItem(Types.ObjectEnd);
    }

    ObjectSerializer.prototype.serializeString = function(string, emitStringType, charOptimization) {
        if (charOptimization && string.length == 1) {
            var ch = string.charCodeAt(0);
            if (ch < 128) {
                this.addTagItem(Types.Char);
                this.addDataItem(Types.Char, ch).displayValue = string;
                return;
            }
        }
        var utf8value = utf8encode(string);
        var size = utf8value.length;
        if (emitStringType) {
            this.addTagItem(Types.String);
        }
        this.serializeNumber(size);
        if (size > 0) {
            this.addDataItem(Types.String, utf8value).displayValue = string;
        }
    }

    ObjectSerializer.prototype.serializeNumber = function(number) {
        var type = findSuitableNumericType(number);

        //TODO: save Types.HighNumber as string
        //[H][i][17][12345678901234567] ?
        //Numeric values of NaN & Infinity are encoded as a null value.
        //TODO: fix [H][H:Infinity]

        this.addTagItem(type);
        this.addDataItem(type, number);
    }

    ObjectSerializer.prototype.serializeBoolean = function(bool) {
        if (bool) {
            this.addTagItem(Types.True);
        } else {
            this.addTagItem(Types.False);
        }
    }

    ObjectSerializer.prototype.addTagItem = function(type) {
        var item = new TagItem(this.currentSemantic, type);
        this.items.push(item);
        return item;
    }

    ObjectSerializer.prototype.addDataItem = function(type, value) {
        var item = new DataItem(this.currentSemantic, type, value);
        this.items.push(item);
        return item;
    }

    ObjectSerializer.prototype.setCurrentSemantic = function(semantic) {
        this.currentSemantic = semantic;
    }

//------------------------------------------------------------------------------

    function BlocksTextRenderer() {
        this.indentStep = '    ';
        this.formalized = false;
        this.highlight = true;
        this.styles = {
                markup: "color: green",
                key: "color: blue",
                value: "color: red",
                arrayItem: "color: orange"
            };
    }

    BlocksTextRenderer.prototype.render = function(items) {
        var text = '';
        var indent = '';
        var nestingLevel = 0;
        var prevBlock = null;
        var count = items.length;
        var startNewLine = false;
        for (var i = 0; i < count; i++) {
            var block = items[i];
            if (block instanceof TagItem) {
                if (block.type == Types.ObjectEnd || block.type == Types.ArrayEnd) {
                    indent = this.getIndent(--nestingLevel);
                    startNewLine = prevBlock != null && prevBlock.type != Types.ObjectBegin && prevBlock.type != Types.ArrayBegin;
                }
                if (prevBlock != null) {
                    if ((prevBlock.semantic & Semantics.LastArrayItemFlag) == Semantics.LastArrayItemFlag) {
                        startNewLine = true;
                    }
                    var prevBlockSemantic = prevBlock.semantic & Semantics.LowValuesMask;
                    var blockSemantic = block.semantic & Semantics.LowValuesMask;
                    if (prevBlockSemantic == Semantics.Value && blockSemantic == Semantics.Key) {
                        startNewLine = true;
                    }
                    if (prevBlock.type == Types.ObjectEnd || prevBlock.type == Types.ArrayEnd) {
                        startNewLine = true;
                    }
                }
                if (startNewLine) {
                    text += '\n' + indent;
                    startNewLine = false;
                }
                text += this.renderTagBlock(block);
                if (block.type == Types.ObjectBegin || block.type == Types.ArrayBegin) {
                    indent = this.getIndent(++nestingLevel);
                    startNewLine = true;
                }
            } else {
                text += this.renderDataBlock(block);
            }
            prevBlock = block;
        }
        return text;
    }

    BlocksTextRenderer.prototype.renderTagBlock = function(block) {
        if (this.highlight) {
            var style = this.getStyle(block);
            return '<span style="' + style + '">[' + block.type + ']</span>';
        } else {
            return '[' + block.type + ']';
        }
    }

    BlocksTextRenderer.prototype.renderDataBlock = function(block) {
        var value = (block.displayValue != null) ? block.displayValue : block.value;
        if (this.formalized) {
            value = block.type + ':' + value;
        }
        if (this.highlight) {
            var style = this.getStyle(block);
            return '<span style="' + style + '">[' + value + ']</span>';
        } else {
            return '[' + value + ']';
        }
    }

    BlocksTextRenderer.prototype.getStyle = function(block) {
        switch(block.semantic & Semantics.LowValuesMask) {
            case Semantics.Markup:
                return this.styles.markup;
            case Semantics.Key:
                return this.styles.key;
            case Semantics.Value:
                return this.styles.value;
            case Semantics.ArrayItem:
                return this.styles.arrayItem;
        }
    }

    BlocksTextRenderer.prototype.getIndent = function(nestingLevel) {
        if (nestingLevel > 0) {
            return Array(nestingLevel + 1).join(this.indentStep);
        } else {
            return '';
        }
    }

//------------------------------------------------------------------------------

    function BinaryWriter() {
        var buffer = new ArrayBuffer(8);
        this.data = new DataView(buffer);
        this.binary = '';
    }

    BinaryWriter.prototype.writeBlocks = function(items) {
        var count = items.length;
        for (var i = 0; i < count; i++) {
            var block = items[i];
            if (block instanceof TagItem) {
                this.binary += block.type;
            } else {
                switch(block.type) {
                    case Types.String:
                    case Types.HighNumber:
                        this.binary += block.value;
                        break;
                    case Types.Int8:
                        this.data.setInt8(0, block.value);
                        this.flush(1);
                        break;
                    case Types.Char:
                    case Types.UInt8:
                        this.data.setUint8(0, block.value);
                        this.flush(1);
                        break;
                    case Types.Int16:
                        this.data.setInt16(0, block.value, false);
                        this.flush(2);
                        break;
                    case Types.Int32:
                        this.data.setInt32(0, block.value, false);
                        this.flush(4);
                        break;
                    case Types.Int64:

                        //TODO: check! JS typically does'n have pure int64.
                        var hi = 0;
                        var lo = 0;

                        this.data.setInt32(0, hi, false);
                        this.data.setInt32(4, lo, false);
                        this.flush(8);
                        break;
                    case Types.Float32:
                        this.data.setFloat32(0, block.value, false);
                        this.flush(4);
                        break;
                    case Types.Float64:
                        this.data.setFloat64(0, block.value, false);
                        this.flush(8);
                        break;
                }
            }
        }
    }

    BinaryWriter.prototype.flush = function(size) {
        for (var i = 0; i < size; i++) {
            this.binary += String.fromCharCode(this.data.getUint8(i));
        }
    }

//------------------------------------------------------------------------------

    function HexRenderer() {
        this.bytesPerLine = 16;
    }

    HexRenderer.prototype.renderBinaryString = function(binary) {
        var text = '';
        var count = binary.length;
        var n = this.bytesPerLine;
        for (var i = 0; i < count; i++) {
            var code = binary.charCodeAt(i);
            if (--n == 0) {
                n = this.bytesPerLine;
                text += code.toString(16) + '\n';
            } else {
                text += code.toString(16) + ' ';
            }
        }
        return text;
    }

//------------------------------------------------------------------------------

    core.ObjectSerializer = ObjectSerializer;
    core.BlocksTextRenderer = BlocksTextRenderer;
    core.BinaryWriter = BinaryWriter;
    core.HexRenderer = HexRenderer;

    return core;

}(UbjsonTestSuiteCore || {}));