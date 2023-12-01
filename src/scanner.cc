#include <cwctype>
#include <iostream>
#include <algorithm>
#include <cstring>
#include <unordered_map>
#include <vector>
#include <list>

#include "tree_sitter/parser.h"

/// GENERAL NOTES ABOUT THIS FILE
///
/// 1. The code may look dated in terms of C++ coding style. This is surprisingly a feature, not a bug.
///    MacOS suffers from terrible compiler compatibility, requiring us to write pre-C++11 code. Ouchie.
/// 2. Quotes, lists and headings (the "nestable detached modifiers") are parsed in this scanner to allow for
///    "infinite" nesting (in reality the cap is at the 16 bit integer limit).

// GENERAL TODOS: Detect the treesitter "error mode" in the scanner.

// Generally discouraged, but fine because this is a confined, single file
// scanner.
using namespace std;

// Make TokenType derive from `char` for compact serialization.
enum TokenType : char {
    WHITESPACE,
    END_OF_FILE,
    PARA_BREAK,
    NEWLINE,

    BOLD_CLOSE,
    ITALIC_CLOSE,
    UNDERLINE_CLOSE,
    STRIKETHROUGH_CLOSE,
    SPOILER_CLOSE,
    SUPERSCRIPT_CLOSE,
    SUBSCRIPT_CLOSE,
    VERBATIM_CLOSE,
    COMMENT_CLOSE,
    MATH_CLOSE,
    MACRO_CLOSE,

    OPEN_CONFLICT,
    CLOSE_CONFLICT,

    HEADING,
    UNORDERED_LIST,
    ORDERED_LIST,
    QUOTE,

    WEAK_DELIMITING_MODIFIER,

    DEDENT,
    DID_DEDENT,
};

bool iswnl(char c) {
    return iswspace(c) && !iswblank(c);
}
bool iswword(char c) {
    return !iswblank(c) && !iswpunct(c);
}

struct Scanner {
    TSLexer* lexer;
    // Stores indentation data related to headings, lists and other nestable item types.
    std::unordered_map< char, std::vector<uint16_t> > indents;
    std::unordered_map<int32_t, TokenType> attached_modifiers;
    bool single_line_mode;
    Scanner() {
        attached_modifiers['*'] = BOLD_CLOSE;
        attached_modifiers['/'] = ITALIC_CLOSE;
        attached_modifiers['_'] = UNDERLINE_CLOSE;
        attached_modifiers['-'] = STRIKETHROUGH_CLOSE;
        attached_modifiers['!'] = SPOILER_CLOSE;
        attached_modifiers['^'] = SUPERSCRIPT_CLOSE;
        attached_modifiers[','] = SUBSCRIPT_CLOSE;
        attached_modifiers['`'] = VERBATIM_CLOSE;
        attached_modifiers['%'] = COMMENT_CLOSE;
        attached_modifiers['$'] = MATH_CLOSE;
        attached_modifiers['&'] = MACRO_CLOSE;
        single_line_mode = false;
    }

    /**
     * @brief Searches through a range of valid symbols.
     *
     * @param valid_symbols Usually `valid_symbols` that were passed to you in the `scan` function.
     * @param start The beginning index to start search (inclusive).
     * @param end The end index of the search (inclusive).
     */
    int32_t get_valid_symbol(const bool* valid_symbols, size_t start, size_t end) {
        for (; start <= end; start++) {
            if (valid_symbols[start])
                return start;
        }

        return -1;
    }

    bool scan(const bool *valid_symbols) {
        if (lexer->eof(lexer)) {
            if (valid_symbols[END_OF_FILE]) {
                lexer->result_symbol = END_OF_FILE;
                lexer->mark_end(lexer);
                return true;
            }
            return false;
        }

        // If we are at the beginning of a line, parse any whitespace that we encounter.
        // This is then returned as `$._preceding_whitespace`, which is part of the `extras`
        // group, meaning it can theoretically exist "anywhere in the document". This prevents
        // odd errors with preceding whitespace like ` @end`, where `@end` isn't parsed because
        // a `$._whitespace` is encountered, causing the parser to continue parsing as if everything
        // were a `$.paragraph_segment`.
        if (lexer->get_column(lexer) == 0) {
            bool have_whitespace = false;
            if (iswblank(lexer->lookahead)) {
                have_whitespace = true;
                while (iswblank(lexer->lookahead))
                    skip();
                lexer->mark_end(lexer);
            }
            // TODO: move heading logic to here
            // if (lexer->lookahead == '*') {
            //     int32_t character = lexer->lookahead;
            //     std::vector<uint16_t>& indent_vector = indents[lexer->lookahead];
            //     size_t count = 0;
            //
            //     // set end here to use on DEDENT
            //     lexer->mark_end(lexer);
            //
            //     while (lexer->lookahead == character) {
            //         count++;
            //         advance();
            //     }
            //
            //     if (!iswblank(lexer->lookahead)) {
            //         // TODO: WEAK_DELIMITING_MODIFIER
            //         // TODO: remove if statement below.
            //         // wrap detached modifier parsing logic to external method
            //         if (have_whitespace) {
            //             lexer->result_symbol = WHITESPACE;
            //             return true;
            //         }
            //         return false;
            //     }
            //     if (valid_symbols[DEDENT] && !indent_vector.empty() && count <= indent_vector.back()) {
            //         indent_vector.pop_back();
            //         lexer->result_symbol = DEDENT;
            //         return true;
            //     } else {
            //         // We track the indentation level of the object we just parsed by putting it in
            //         // the indent vector, update our "head" to be past the thing we just parsed by calling
            //         // `mark_end`, then return the node. Simple.
            //         indent_vector.push_back(count);
            //         lexer->mark_end(lexer);
            //         switch (character) {
            //             case '*': lexer->result_symbol = HEADING; break;
            //             case '-': lexer->result_symbol = UNORDERED_LIST; break;
            //             case '~': lexer->result_symbol = ORDERED_LIST; break;
            //             case '>': lexer->result_symbol = QUOTE; break;
            //         }
            //         return true;
            //     }
            // }

            if (have_whitespace) {
                lexer->result_symbol = WHITESPACE;
                return true;
            }
        }
        if (iswnl(lexer->lookahead)) {
            // TODO: consider "\r\n"
            advance();
            lexer->mark_end(lexer);
            if (valid_symbols[NEWLINE]) {
                lexer->result_symbol = NEWLINE;
                return true;
            }
            if (single_line_mode) {
                lexer->result_symbol = PARA_BREAK;
                single_line_mode = false;
                return true;
            }
            while (iswblank(lexer->lookahead) && !lexer->eof(lexer)) {
                skip();
            }
            if (iswspace(lexer->lookahead) || lexer->eof(lexer)) {
                lexer->result_symbol = PARA_BREAK;
                return true;
            }
            // roughly parse next tokens to check if newline is followed by paragraph-breaking-prefixs
            // detached modifiers & weak delimiting modifier
            if (lexer->lookahead == '*') {
                int32_t character = lexer->lookahead;
                skip();
                size_t count = 0;
                while (lexer->lookahead == character) {
                    count++;
                    skip();
                }
                if (iswblank(lexer->lookahead)) {
                    lexer->result_symbol = PARA_BREAK;
                    return true;
                } else if (character == '-' && count >= 2 && (lexer->lookahead == '\n' || lexer->lookahead == '\r')) {
                    lexer->result_symbol = PARA_BREAK;
                    return true;
                }
            }
            // tags
            if (lexer->lookahead == '+') {
                skip();
                if (iswword(lexer->lookahead) && !lexer->eof(lexer)) {
                    lexer->result_symbol = PARA_BREAK;
                    return true;
                }
            }
            return false;
        }

        // If the parser expects a heading, list type or quote then attempt to parse said item.
        if ((valid_symbols[HEADING] && lexer->lookahead == '*') || (valid_symbols[UNORDERED_LIST] && lexer->lookahead == '-') || (valid_symbols[ORDERED_LIST] && lexer->lookahead == '~') || (valid_symbols[QUOTE] && lexer->lookahead == '>')) {
            int32_t character = lexer->lookahead;
            std::vector<uint16_t>& indent_vector = indents[lexer->lookahead];
            size_t count = 0;

            // We create a "checkpoint" for ourselves here. This allows us to parse as much as we want,
            // and if we encounter something unexpected (i.e. no whitespace after the parsed characters)
            // then we can `return false` and fall back to the grammar instead.
            lexer->mark_end(lexer);

            // We may encounter an arbitrary amount of characters, so parse those here.
            while (lexer->lookahead == character) {
                count++;
                advance();
            }

            // Every detached modifier must be immediately followed by whitespace. If it is not, return false.
            if (!iswblank(lexer->lookahead)) {
                // There is an edge case that can be parsed here however - the weak delimiting modifier may
                // consist of two or more `-` characters, and must be immediately succeeded with a newline.
                // If those criteria are met, return the `WEAK_DELIMITING_MODIFIER` instead.
                if (character == '-' && count >= 2 && (lexer->lookahead == '\n' || lexer->lookahead == '\r')) {
                    // Advance past the newline as well.
                    advance();

                    // When `mark_end()` is called again we essentially move the previous checkpoint to the new "head".
                    lexer->mark_end(lexer);
                    lexer->result_symbol = WEAK_DELIMITING_MODIFIER;
                    return true;
                }

                return false;
            }

            // The grammar tells us when it expects certain symbols. If we are expecting a `$._dedent` node
            // and there is some valid data in our indent vector then we can issue a DEDENT which essentially
            // terminates the current heading.
            // Note how this logic is processed only after we parse another object of the same type, say
            // another heading. This allows us to create a zero-width DEDENT node with the previous checkpoint
            // that we set at the beginning of this block, then have the lexer be called *again* but since we previously
            // generated a DEDENT node `valid_symbols[DEDENT]` will be `false` and we will fall through to the
            // regular heading logic. Another win for ingenuity.
            //
            // To illustrate, consider:
            // * Title
            // ** Title
            // * Title
            //
            // We parse the first heading and the second heading just fine, but when we parse the last
            // heading `valid_symbols[DEDENT]` is `true`, the indent vector is not empty and the `count`
            // (which would be `1` in this case) is less than the last element in the indent vector (`2`,
            // since our last heading is of level 2). This triggers us to generate a zero width DEDENT node,
            // terminating the level 2 heading, then the custom lexer is invoked yet again and since we've
            // already closed the previous heading treesitter no longer expects a DEDENT node and this statement
            // falls through to the other branch, parsing the level 1 heading.
            if (valid_symbols[DEDENT] && !indent_vector.empty() && count <= indent_vector.back()) {
                indent_vector.pop_back();
                lexer->result_symbol = DEDENT;
                return true;
            } else {
                // We track the indentation level of the object we just parsed by putting it in
                // the indent vector, update our "head" to be past the thing we just parsed by calling
                // `mark_end`, then return the node. Simple.
                indent_vector.push_back(count);
                lexer->mark_end(lexer);
                switch (character) {
                    case '*':
                        lexer->result_symbol = HEADING;
                        // HACK: what if slides?
                        single_line_mode = true;
                        break;
                    case '-': lexer->result_symbol = UNORDERED_LIST; break;
                    case '~': lexer->result_symbol = ORDERED_LIST; break;
                    case '>': lexer->result_symbol = QUOTE; break;
                }
                if (single_line_mode) {
                    while (iswblank(lexer->lookahead))
                        skip();
                    if (lexer->lookahead == ':') {
                        skip();
                        if (lexer->lookahead == ':') skip();
                        if (iswnl(lexer->lookahead)) {
                            single_line_mode = false;
                        }
                    }
                }
                return true;
            }
        }

        std::unordered_map<int32_t, TokenType>::iterator iter = attached_modifiers.find(lexer->lookahead);
        if (iter != attached_modifiers.end()) {
            const int token_char = iter->first;
            const TokenType token_type = iter->second;
            advance();
            lexer->mark_end(lexer);
            if (lexer->lookahead == token_char) {
                // repeated modifiers are handled by grammar.js
                return false;
            }
            if(valid_symbols[token_type]
                // || valid_symbols[token_type + (FREE_BOLD_CLOSE - BOLD_CLOSE)]
            ) {
                // *_close is valid
                if(iswspace(lexer->lookahead) || iswpunct(lexer->lookahead) || lexer->eof(lexer)) {
                    lexer->result_symbol = token_type;
                    // if (is_free_close) {
                    //     lexer->result_symbol += (FREE_BOLD_CLOSE - BOLD_CLOSE);
                    // }
                    // check if FREE_*_CLOSE is valid
                    if (!valid_symbols[lexer->result_symbol])
                        return false;
                    return true;
                } else {
                    lexer->result_symbol = CLOSE_CONFLICT;
                    return true;
                }
            } else if(valid_symbols[OPEN_CONFLICT]) {
                // previous token was word, but *_close isn't valid
                // prevent prasing as *_open token
                // haven't opened bold/or bold_open was parsed as punctuation
                lexer->result_symbol = OPEN_CONFLICT;
                return true;
            } else {
                // TODO: when is this case..?
                return false;
            }
        }

        return false;
    }

    void skip() { lexer->advance(lexer, true); }
    void advance() { lexer->advance(lexer, false); }
};

extern "C" {
    void *tree_sitter_norg3_external_scanner_create() { return new Scanner(); }

    void tree_sitter_norg3_external_scanner_destroy(void *payload) {
        delete static_cast<Scanner *>(payload);
    }

    bool tree_sitter_norg3_external_scanner_scan(void *payload, TSLexer *lexer,
            const bool *valid_symbols) {
        Scanner *scanner = static_cast<Scanner*>(payload);
        scanner->lexer = lexer;
        return scanner->scan(valid_symbols);
    }

    unsigned tree_sitter_norg3_external_scanner_serialize(void *payload,
            char *buffer) {
        Scanner* scanner = static_cast<Scanner*>(payload);

        size_t total_size = 0;

        // The serialization format feels like magic initially but is quite simple.
        // We must somehow serialize a complex data type like a hashmap into a single
        // array of (by default) 1024 bytes of data.
        //
        // We do this by unravelling each element of the hashmap into a format that looks
        // like this:
        //
        // <char> <vector-size> <data>
        //
        // Where `char` is the key of the unordered map entry and `vector-size` is the size
        // of the data contained within the value of the hashmap entry.
        //
        // This data can be stored contiguously in memory without needing terminator characters
        // or the like thanks to the `vector-size` element.

        buffer[total_size++] = scanner->single_line_mode;

        // NOTE: We cannot use range-based for loops as they are a post C++11 addition. Fun.
        for (std::unordered_map< char, std::vector<uint16_t> >::iterator kv = scanner->indents.begin(); kv != scanner->indents.end(); ++kv) {
            uint16_t size = kv->second.size();
            buffer[total_size] = kv->first;

            std::memcpy(&buffer[total_size + 1], &size, sizeof(size));
            std::memcpy(&buffer[total_size + 3], kv->second.data(), size * sizeof(size));

            total_size += (size * sizeof(size)) + 3;
        }

        return total_size;
    }

    void tree_sitter_norg3_external_scanner_deserialize(void *payload,
            const char *buffer,
            unsigned length) {
        if (length == 0)
            return;

        Scanner* scanner = static_cast<Scanner*>(payload);

        // See the serialization function to understand how the format is specified.
        // This function is simple in that it extracts the data out of the serialization
        // format and puts it back into the correct C++ containers, all while trying really
        // hard not to leak any memory :p

        size_t head = 0;

        scanner->single_line_mode = buffer[head++];

        while (head < length) {
            char key = buffer[head];
            uint16_t len = 0;
            std::memcpy(&len, &buffer[head + 1], sizeof(len));

            scanner->indents[key].resize(len);
            std::memcpy(scanner->indents[key].data(), &buffer[head + 3], len * sizeof(uint16_t));
            head += (len * sizeof(uint16_t)) + 3;
        }
    }
}
