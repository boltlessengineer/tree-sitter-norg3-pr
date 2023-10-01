#include <bitset>
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

using namespace std;

enum TokenType : char {
    PRE_WHITESPACE,
    WHITESPACE,
    WORD,

    BOLD_OPEN,
    BOLD_CLOSE,
    FREE_BOLD_OPEN,
    FREE_BOLD_CLOSE,
    ITALIC_OPEN,
    ITALIC_CLOSE,
    FREE_ITALIC_OPEN,
    FREE_ITALIC_CLOSE,
    STRIKETHROUGH_OPEN,
    STRIKETHROUGH_CLOSE,
    FREE_STRIKETHROUGH_OPEN,
    FREE_STRIKETHROUGH_CLOSE,
    UNDERLINE_OPEN,
    UNDERLINE_CLOSE,
    FREE_UNDERLINE_OPEN,
    FREE_UNDERLINE_CLOSE,
    SPOILER_OPEN,
    SPOILER_CLOSE,
    FREE_SPOILER_OPEN,
    FREE_SPOILER_CLOSE,
    SUPERSCRIPT_OPEN,
    SUPERSCRIPT_CLOSE,
    FREE_SUPERSCRIPT_OPEN,
    FREE_SUPERSCRIPT_CLOSE,
    SUBSCRIPT_OPEN,
    SUBSCRIPT_CLOSE,
    FREE_SUBSCRIPT_OPEN,
    FREE_SUBSCRIPT_CLOSE,
    INLINE_COMMENT_OPEN,
    INLINE_COMMENT_CLOSE,
    FREE_INLINE_COMMENT_OPEN,
    FREE_INLINE_COMMENT_CLOSE,
    VERBATIM_OPEN,
    VERBATIM_CLOSE,
    FREE_VERBATIM_OPEN,
    FREE_VERBATIM_CLOSE,
    FREE_OPEN,
    FREE_CLOSE,

    LINK_MODIFIER,
    ESCAPE_SEQUENCE,
    PUNC_END,

    HEADING,
    UNORDERED_LIST,
    ORDERED_LIST,
    QUOTE,

    WEAK_DELIMITING_MODIFIER,

    DEDENT,

    COUNT,
};

bool was_attached_close_mod(TokenType token) {
    return token >= BOLD_OPEN && token < LINK_MODIFIER && (token % 2 == BOLD_CLOSE % 2);
}

bool is_word(char c) {
    return !iswspace(c) && !iswpunct(c);
}

struct Scanner {
    TSLexer* lexer;
    std::unordered_map< char, std::vector<uint16_t> > indents;
    std::unordered_map<int32_t, TokenType> lookup;
    Scanner() {
        lookup['*'] = BOLD_OPEN;
        lookup['/'] = ITALIC_OPEN;
        lookup['-'] = STRIKETHROUGH_OPEN;
        lookup['_'] = UNDERLINE_OPEN;
        lookup['!'] = SPOILER_OPEN;
        lookup['`'] = VERBATIM_OPEN;
        lookup['^'] = SUPERSCRIPT_OPEN;
        lookup[','] = SUBSCRIPT_OPEN;
        lookup['%'] = INLINE_COMMENT_OPEN;
    }

    TokenType last_token = WHITESPACE;

    bool scan(const bool *valid_symbols) {
        if (lexer->eof(lexer))
            return false;

        if (lexer->get_column(lexer) == 0) {
            last_token = WHITESPACE;
            if (iswblank(lexer->lookahead)) {
                while (iswblank(lexer->lookahead))
                    advance();

                lexer->result_symbol = PRE_WHITESPACE;
                return true;
            }
        }

        if (valid_symbols[PUNC_END] && last_token != PUNC_END) {
            lexer->mark_end(lexer);
            last_token = PUNC_END;
            return true;
        }

        char cache = lexer->lookahead;
        lexer->mark_end(lexer);
        advance();

        // ESCAPE SEQUENCE
        if (valid_symbols[ESCAPE_SEQUENCE] && cache == '\\') {
            if (lexer->lookahead) {
                lexer->mark_end(lexer);
                lexer->result_symbol = last_token = ESCAPE_SEQUENCE;
                return true;
            }
            return false;
        }
        // WHITESPACE
        if (iswblank(cache)) {
            while (iswblank(lexer->lookahead)) {
                advance();
            }
            lexer->mark_end(lexer);
            lexer->result_symbol = last_token = WHITESPACE;
            return true;
        }

        // WORD
        const bool found_punc = cache && iswpunct(cache);
        if (valid_symbols[WORD] && cache && is_word(cache)) {
            while (lexer->lookahead && !iswspace(lexer->lookahead) && !iswpunct(lexer->lookahead)) {
                advance();
            }
            lexer->mark_end(lexer);
            lexer->result_symbol = last_token = WORD;
            return true;
        }

        if (valid_symbols[LINK_MODIFIER] && last_token == WORD && cache == ':' && !iswspace(lexer->lookahead)) {
            lexer->mark_end(lexer);
            lexer->result_symbol = last_token = LINK_MODIFIER;
            return true;
        } else if (valid_symbols[LINK_MODIFIER] && was_attached_close_mod(last_token) && cache == ':' && lexer->lookahead && is_word(lexer->lookahead)) {
            lexer->mark_end(lexer);
            lexer->result_symbol = last_token = LINK_MODIFIER;
            return true;
        }

        std::unordered_map<int32_t, TokenType>::iterator  n_attached_mod = lookup.find(lexer->lookahead);
        if (cache == '|' && (n_attached_mod != lookup.end()) && valid_symbols[n_attached_mod->second + 3]) {
            advance();
            if (!lexer->lookahead || (!is_word(lexer->lookahead) && lexer->lookahead != n_attached_mod->first)) {
                lexer->mark_end(lexer);
                lexer->result_symbol = last_token = (TokenType)(n_attached_mod->second + 3);
                return true;
            }
            return false;
        }
        std::unordered_map<int32_t, TokenType>::iterator  attached_mod = lookup.find(cache);
        if (attached_mod != lookup.end() && valid_symbols[attached_mod->second + 2] && last_token != WORD && lexer->lookahead == '|') {
            // _FREE_OPEN
            // (-word) ['*', '|']
            advance();
            lexer->mark_end(lexer);
            lexer->result_symbol = last_token = (TokenType)(attached_mod->second + 2);
            return true;
        }
        if (attached_mod != lookup.end() && valid_symbols[attached_mod->second + 1] && last_token != WHITESPACE && (!lexer->lookahead || (!is_word(lexer->lookahead) && lexer->lookahead != attached_mod->first))) {
            // _CLOSE
            // (-ws) ['*', -(word | '*')]
            lexer->mark_end(lexer);
            lexer->result_symbol = last_token = (TokenType)(attached_mod->second + 1);
            return true;
        }
        if (attached_mod != lookup.end() && valid_symbols[attached_mod->second] && last_token != WORD && lexer->lookahead && !iswspace(lexer->lookahead) && (lexer->lookahead != attached_mod->first)) {
            // _OPEN
            // (-word) ['*', -(ws | '*')]
            lexer->mark_end(lexer);
            lexer->result_symbol = last_token = attached_mod->second;
            return true;
        }

        if ((valid_symbols[HEADING] && cache == '*') || (valid_symbols[UNORDERED_LIST] && cache == '-') || (valid_symbols[ORDERED_LIST] && cache == '~') || (valid_symbols[QUOTE] && cache == '>')) {
            std::vector<uint16_t>& indent_vector = indents[lexer->lookahead];
            size_t count = 1;

            while (lexer->lookahead == cache) {
                count++;
                advance();
            }

            if (!iswspace(lexer->lookahead) || lexer->lookahead == '\n' || lexer->lookahead == '\r') {
                if (cache == '-' && count >= 2 && (lexer->lookahead == '\n' || lexer->lookahead == '\r')) {
                    // Advance past the newline as well.
                    advance();
                    lexer->mark_end(lexer);
                    lexer->result_symbol = WEAK_DELIMITING_MODIFIER;
                    return true;
                }

                return false;
            }

            if (valid_symbols[DEDENT] && !indent_vector.empty() && count <= indent_vector.back()) {
                indent_vector.pop_back();
                lexer->result_symbol = DEDENT;
                return true;
            } else {
                indent_vector.push_back(count);
                lexer->mark_end(lexer);
                switch (cache) {
                    case '*': lexer->result_symbol = HEADING; break;
                    case '-': lexer->result_symbol = UNORDERED_LIST; break;
                    case '~': lexer->result_symbol = ORDERED_LIST; break;
                    case '>': lexer->result_symbol = QUOTE; break;
                }
                return true;
            }
        }

        return false;
    }

    void skip() { lexer->advance(lexer, true); }
    void advance() { lexer->advance(lexer, false); }
};

extern "C" {
    void *tree_sitter_norg_external_scanner_create() { return new Scanner(); }

    void tree_sitter_norg_external_scanner_destroy(void *payload) {
        delete static_cast<Scanner *>(payload);
    }

    bool tree_sitter_norg_external_scanner_scan(void *payload, TSLexer *lexer,
            const bool *valid_symbols) {
        Scanner *scanner = static_cast<Scanner*>(payload);
        scanner->lexer = lexer;
        return scanner->scan(valid_symbols);
    }

    unsigned tree_sitter_norg_external_scanner_serialize(void *payload,
            char *buffer) {
        Scanner* scanner = static_cast<Scanner*>(payload);

        size_t total_size = 0;

        buffer[total_size++] = scanner->last_token;
        for (std::unordered_map< char, std::vector<uint16_t> >::iterator kv = scanner->indents.begin(); kv != scanner->indents.end(); ++kv) {
            uint16_t size = kv->second.size();
            buffer[total_size] = kv->first;

            std::memcpy(&buffer[total_size + 1], &size, sizeof(size));
            std::memcpy(&buffer[total_size + 3], kv->second.data(), size * sizeof(size));

            total_size += (size * sizeof(size)) + 3;
        }

        return total_size;
    }

    void tree_sitter_norg_external_scanner_deserialize(void *payload,
            const char *buffer,
            unsigned length) {
        Scanner* scanner = static_cast<Scanner*>(payload);
        scanner->last_token = WHITESPACE;

        if (length == 0)
            return;

        size_t head = 0;

        scanner->last_token = (TokenType)buffer[head++];

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
