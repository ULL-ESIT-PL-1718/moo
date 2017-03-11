(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory) /* global define */
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.Moo = factory()
  }
}(this, function() {
  'use strict';

  var hasSticky = typeof new RegExp().sticky === 'boolean'


  function reEscape(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  }
  function reGroups(s) {
    var re = new RegExp('|' + s)
    return re.exec('').length - 1
  }
  function reCapture(s) {
    return '(' + s + ')'
  }
  function reUnion(regexps) {
    var source =  regexps.map(function(s) {
      return "(?:" + s + ")"
    }).join('|')
    return "(?:" + source + ")"
  }


  function compareLength(a, b) {
    return b.length - a.length
  }

  function regexpOrLiteral(obj) {
    if (typeof obj === 'string') {
      return '(' + reEscape(obj) + ')'

    } else if (obj && obj.constructor === RegExp) {
      // TODO: consider /u support
      if (obj.ignoreCase) { throw new Error('RegExp /i flag not allowed') }
      if (obj.global) { throw new Error('RegExp /g flag is implied') }
      if (obj.sticky) { throw new Error('RegExp /y flag is implied') }
      if (obj.multiline) { throw new Error('RegExp /m flag is implied') }
      if (/^\(*\^/.test(obj.source)) {
        throw new Error('RegExp ^ has no effect')
      }
      return obj.source

    } else if (obj && obj.constructor === Array) {
      // sort to help ensure longest match
      var options = obj.slice()
      options.sort(compareLength)
      return '(' + options.map(reEscape).join('|') + ')'

    } else {
      throw new Error('not a pattern: ' + obj)
    }
  }


  var Token = function(name, value) {
    this.name = name
    this.value = value || ''
  }

  Token.prototype.toString = function() {
    return this.value || this.name
  }


  function compile(rules) {
    var parts = []

    var groups = []
    for (var i=0; i<rules.length; i++) {
      var rule = rules[i]
      var name = rule[0]
      var re = rule[1]

      // convert string literal to RegExp
      re = regexpOrLiteral(re)

      // validate
      if (new RegExp(re).test("")) {
        throw new Error("RegExp matches empty string: " + new RegExp(re))
      }

      // store named group
      var groupCount = reGroups(re)
      if (groupCount > 1) {
        throw new Error("RegExp has more than one capture group: " + re)
      }
      groups.push(name)

      // store regex
      var isCapture = !!groupCount
      if (!isCapture) re = reCapture(re)
      parts.push(re)
    }

    var suffix = hasSticky ? '' : '|(?:)'
    var flags = hasSticky ? 'ym' : 'gm'
    var regexp = new RegExp(reUnion(parts) + suffix, flags)

    return function(input) {
      return lexer(regexp, groups, input)
    }
  }

  function lexer(re, groups, data) {
    var buffer = data || ''
    var groupCount = groups.length
    re.lastIndex = 0 // reset RegExp

    var eat = hasSticky ? function() {
      // assume re is /y
      var match = re.exec(buffer)
      return match
    } : function() {
      // assume re is /g
      var match = re.exec(buffer)
      // assert(match)
      // assert(match.index === 0)
      if (match[0].length === 0) {
        return null
      }
      return match
    }
    // TODO: try instead the |(?:) trick?

    function lex() {
      if (re.lastIndex === buffer.length) {
        return // EOF
      }

      var match = eat()
      if (match === null) {
        var token = new Token('ERRORTOKEN', lexer.remaining())
        re.lastIndex = buffer.length
        return token
      }

      var group = null
      for (var i = 0; i < groupCount; i++) {
        var value = match[i + 1]
        if (value !== undefined) {
          group = groups[i]
          break
        }
      }
      // assert(i < groupCount)

      // TODO is `buffer` being leaked here?
      return new Token(group, value)
    }

    // TODO multiple states / continuations ?

    var lexer
    return lexer = {
      lex: lex,
      lexAll: function() {
        var tokens = []
        var token
        while ((token = lex())) {
          tokens.push(token)
        }
        return tokens
      },
      groups: groups,
      seek: function(newIndex) { re.lastIndex = newIndex },
      feed: function(data) { buffer += data },
      remaining: function() { return buffer.slice(re.lastIndex) },
      clone: function(input) {
        return lexer(new RegExp(re.source, re.flags), groups, input)
      },
    }
  }


  compile.Token = Token
  return compile

}))
