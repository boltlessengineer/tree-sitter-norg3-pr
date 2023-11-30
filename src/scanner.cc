#include <cwctype>
#include <iostream>
#include <algorithm>
#include <cstring>
#include <unordered_map>
#include <vector>
#include <list>
#include <bitset>
#include <unordered_set>
#include <stack>

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

#define DEBUG

#ifdef DEBUG
    #define unreachable() fprintf(stderr, "unreachable src/scanner.c:%d\n", __LINE__)
    #define assert(a, ...) \
    if (!(a)) {\
        fprintf(stderr, __VA_ARGS__);\
        exit(EXIT_FAILURE);\
    }
#else
    #define unreachable() while (false);
    #define assert(a, ...) while (false);
#endif

// Make TokenType derive from `char` for compact serialization.
enum TokenType : char {
    WHITESPACE,
    END_OF_FILE,

    BOLD_OPEN,
    ITALIC_OPEN,
    UNDERLINE_OPEN,
    STRIKETHROUGH_OPEN,
    SPOILER_OPEN,
    SUPERSCRIPT_OPEN,
    SUBSCRIPT_OPEN,

    VERBATIM_OPEN,
    COMMENT_OPEN,
    MATH_OPEN,
    MACRO_OPEN,

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
    NL_CLOSE_CONFLICT,
    FLAG_RESET_MARKUP,
    FLAG_NON_OPEN,

    HEADING,
    UNORDERED_LIST,
    ORDERED_LIST,
    QUOTE,

    WEAK_DELIMITING_MODIFIER,

    DEDENT,
};

bool iswlb(wint_t c) {
    return iswspace(c) && iswblank(c);
}

class AttStack {
    std::unordered_set<TokenType> lookup;
    std::stack<TokenType> stack;

public:
#ifdef DEBUG
    void print() {
        std::stack<TokenType> s = stack;
        std::cout << "stack: ";
        while (!s.empty()) {
            std::cout << s.top();
            s.pop();

            if (!s.empty())
                std::cout << ",";
        }
        std::cout << std::endl;
    }
#endif

    void push(TokenType num) {
        stack.push(num);
        lookup.insert(num);
    }

    TokenType pop() {
        if (stack.empty()) 
            return WHITESPACE;

        TokenType value = stack.top();
        stack.pop();
        lookup.erase(value);
        return value;
    }

    bool contains(TokenType num) {
        return lookup.find(num) != lookup.end(); 
    }

    void pop_until(int num) {
        while (!stack.empty() && stack.top() != num) {
            pop();
        }

        if (!stack.empty())
            pop();
    }
    size_t size() {
        return stack.size();
    }
    void reset() {
        // pop all elements from the stack and remove them from the lookup
        while (!stack.empty()) {
            TokenType value = pop();
            lookup.erase(value);
        }
    }
    size_t serialize(char* buffer) {
        const size_t stack_size = size();
        size_t total_size = 0;
        buffer[total_size++] = size();
        size_t i = 0;
        for (; i < stack_size; i++)
            buffer[total_size + i] = pop();
        total_size += i;
        assert(stack.empty(), "stack after serialization is not empty\n");
        return total_size;
    }
    size_t deserialize(const char* buffer) {
        size_t stack_size = *buffer;
        buffer += 1;
        for (int i = stack_size - 1; i >= 0; i--)
            push(TokenType(buffer[i]));
        size_t total_size = 1 + stack_size;
        return total_size;
    }
};

struct Scanner {
    TSLexer* lexer;
    // Stores indentation data related to headings, lists and other nestable item types.
    std::unordered_map< char, std::vector<uint16_t> > indents;
    std::unordered_map<int32_t, TokenType> attached_modifiers;
    std::bitset<BOLD_CLOSE - BOLD_OPEN> active_mods;
    AttStack mod_stack;
    Scanner() {
        attached_modifiers['*'] = BOLD_CLOSE;
        attached_modifiers['/'] = ITALIC_CLOSE;
        attached_modifiers['_'] = UNDERLINE_CLOSE;
        attached_modifiers['-'] = STRIKETHROUGH_CLOSE;
        attached_modifiers['!'] = SPOILER_CLOSE;
        attached_modifiers['^'] = SUPERSCRIPT_CLOSE;
        attached_modifiers[','] = SUBSCRIPT_CLOSE;
        // attached_modifiers['`'] = VERBATIM_CLOSE;
        // attached_modifiers['%'] = COMMENT_CLOSE;
        // attached_modifiers['$'] = MATH_CLOSE;
        // attached_modifiers['&'] = MACRO_CLOSE;
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
                return true;
            }
            return false;
        }

        if (valid_symbols[FLAG_RESET_MARKUP])
            mod_stack.reset();
        if (valid_symbols[FLAG_NON_OPEN]) {
            mod_stack.pop();
            lexer->result_symbol = FLAG_NON_OPEN;
            return true;
        }

        // If we are at the beginning of a line, parse any whitespace that we encounter.
        // This is then returned as `$._preceding_whitespace`, which is part of the `extras`
        // group, meaning it can theoretically exist "anywhere in the document". This prevents
        // odd errors with preceding whitespace like ` @end`, where `@end` isn't parsed because
        // a `$._whitespace` is encountered, causing the parser to continue parsing as if everything
        // were a `$.paragraph_segment`.
        if (lexer->get_column(lexer) == 0) {
            if (iswblank(lexer->lookahead)) {
                while (iswblank(lexer->lookahead))
                    advance();
                lexer->result_symbol = WHITESPACE;
                return true;
            }
        }

        // We create a "checkpoint" for ourselves here. This allows us to parse as much as we want,
        // and if we encounter something unexpected (i.e. no whitespace after the parsed characters)
        // then we can `return false` and fall back to the grammar instead.
        lexer->mark_end(lexer);

        // first lookahead
        int32_t character = lexer->lookahead;
        advance();

        // If the parser expects a heading, list type or quote then attempt to parse said item.
        if ((valid_symbols[HEADING] && character == '*') || (valid_symbols[UNORDERED_LIST] && character == '-') || (valid_symbols[ORDERED_LIST] && character == '~') || (valid_symbols[QUOTE] && character == '>')) {
            if (iswblank(lexer->lookahead) || lexer->lookahead == character) {
            std::vector<uint16_t>& indent_vector = indents[character];
            size_t count = 1;
            // We may encounter an arbitrary amount of characters, so parse those here.
            while (lexer->lookahead == character) {
                count++;
                advance();
            }
            if (!iswblank(lexer->lookahead)) {
                return false;
            }

            // // Every detached modifier must be immediately followed by whitespace. If it is not, return false.
            // if (!iswblank(lexer->lookahead)) {
            //     // There is an edge case that can be parsed here however - the weak delimiting modifier may
            //     // consist of two or more `-` characters, and must be immediately succeeded with a newline.
            //     // If those criteria are met, return the `WEAK_DELIMITING_MODIFIER` instead.
            //     if (character == '-' && count >= 2 && iswlb(lexer->lookahead)) {
            //         // Advance past the newline as well.
            //         advance();
            //
            //         // When `mark_end()` is called again we essentially move the previous checkpoint to the new "head".
            //         lexer->mark_end(lexer);
            //         lexer->result_symbol = WEAK_DELIMITING_MODIFIER;
            //         return true;
            //     }
            //
            //     return false;
            // }

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
                    case '*': lexer->result_symbol = HEADING; break;
                    case '-': lexer->result_symbol = UNORDERED_LIST; break;
                    case '~': lexer->result_symbol = ORDERED_LIST; break;
                    case '>': lexer->result_symbol = QUOTE; break;
                }
                return true;
            }
            }
        }

        // TODO: support other verbatim attached modifiers
        if (character == '`') {
            lexer->mark_end(lexer);
            if (lexer->lookahead == character) {
                return false;
            }
            if (valid_symbols[VERBATIM_CLOSE]) {
                if (iswspace(lexer->lookahead) || iswpunct(lexer->lookahead) || lexer->eof(lexer)) {
                    lexer->result_symbol = VERBATIM_CLOSE;
                    return true;
                } else {
                    lexer->result_symbol = CLOSE_CONFLICT;
                    return true;
                }
            } else if (valid_symbols[OPEN_CONFLICT]) {
                // previous token was word, but *_close isn't valid
                lexer->result_symbol = OPEN_CONFLICT;
                return true;
            }
        }

        std::unordered_map<int32_t, TokenType>::iterator iter = attached_modifiers.find(character);
        if (iter != attached_modifiers.end()) {
            const int token_char = iter->first;
            const TokenType token_type = iter->second;
            // advance();
            lexer->mark_end(lexer);
            if (lexer->lookahead == token_char) {
                // repeated modifiers are handled by grammar.js
                return false;
            }
            if (mod_stack.contains(token_type)) {
                // markup is active
                if (valid_symbols[NL_CLOSE_CONFLICT]) {
                    lexer->result_symbol = NL_CLOSE_CONFLICT;
                    return true;
                } else if (iswspace(lexer->lookahead) || iswpunct(lexer->lookahead) || lexer->eof(lexer)) {
                    lexer->result_symbol = token_type;
                    mod_stack.pop_until(token_type);
                    return true;
                } else {
                    lexer->result_symbol = CLOSE_CONFLICT;
                    return true;
                }
            } else if (valid_symbols[OPEN_CONFLICT]) {
                // previous token was word, but *_close isn't valid
                return false;
            } else if (valid_symbols[token_type - BOLD_CLOSE + BOLD_OPEN] && !mod_stack.contains(token_type)) {
                // markup can be started
                if (!iswspace(lexer->lookahead) && !lexer->eof(lexer)) {
                    lexer->result_symbol = token_type - BOLD_CLOSE + BOLD_OPEN;
                    mod_stack.push(token_type);
                    return true;
                } else {
                    return false;
                }
            }
            return false;
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

        total_size += scanner->mod_stack.serialize(buffer);

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
        scanner->mod_stack.reset();
        head += scanner->mod_stack.deserialize(buffer);

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
