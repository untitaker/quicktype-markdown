import * as fs from "fs";

import { ArrayType, matchType, Type, ClassProperty, Sourcelike, modifySource, Name, quicktype, InputData, JSONSchemaInput, TypeScriptTargetLanguage, TypeScriptRenderer, RenderContext, getOptionValues, tsFlowOptions, ClassType } from "quicktype/dist/quicktype-core";


// UnionType is not exported
function isUnionType(t: any): boolean {
    return t.kind == "union";
}

// not exposed from quicktype, redefined
function singleWord(...source: Sourcelike[]): any { // MultiWord
    return { source, needsParens: false };
}

// not exposed from quicktype, redefined
function parenIfNeeded({ source, needsParens }: any): Sourcelike { // MultiWord
    if (needsParens) {
        return ["(", source, ")"];
    }
    return source;
}

class MarkdownTargetLanguage extends TypeScriptTargetLanguage {
    protected makeRenderer(
        renderContext: RenderContext,
        untypedOptionValues: { [name: string]: any }
    ): TypeScriptRenderer {
        if (untypedOptionValues['just-types'] == undefined) {
            untypedOptionValues['just-types'] = true;
        }

        return new MarkdownRenderer(this, renderContext, getOptionValues(tsFlowOptions, untypedOptionValues));
    }
}

class MarkdownRenderer extends TypeScriptRenderer {
    private emitTypeHeaderMarkdown(t: Type, name: Name) {
        this.emitLine("<a name='typedef-", name, "'>");
        this.emitLine("## `", name, "`");
        this.emitLine("");
        this.emitDescription(this.descriptionForType(t));
        this.emitLine("");
    }

    private emitClassMarkdown(c: ClassType, className: Name) {
        this.emitTypeHeaderMarkdown(c, className);
        this.emitClassPropertiesMarkdown(c);
    }

    private emitEnumMarkdown(c: any, enumName: Name) {  // EnumType export missing
        this.emitTypeHeaderMarkdown(c, enumName);
        this.emitLine("```");
        this.emitEnum(c, enumName);
        this.emitLine("```");
    }

    protected sourceFor(t: Type): any { // MultiWord export missing
        // Change to TS impl: Add cross-references
        if (["class", "object", "enum"].indexOf(t.kind) >= 0) {
            const name = this.nameForNamedType(t);
            return {  // use singleWord instead
                source: ["<a href='#typedef-", name, "'>", name, "</a>"],
                needsParens: false
            };
        };

        return matchType<any>( // MultiWord export missing
            t,
            // Those should all just be handled like in ts target
            _anyType => super.sourceFor(t),
            _nullType => super.sourceFor(t),
            _boolType => super.sourceFor(t),
            _integerType => super.sourceFor(t),
            _doubleType => super.sourceFor(t),
            _stringType => super.sourceFor(t),

            // Change to TS impl: HTML-escape Array<...> 
            arrayType => {
                const itemType = this.sourceFor(arrayType.items);
                if (
                    (arrayType.items instanceof ArrayType) ||
                    isUnionType(arrayType.items)
                ) {
                    return singleWord(["Array&lt;", itemType.source, "&gt;"]);
                } else {
                    return singleWord([parenIfNeeded(itemType), "[]"]);
                }
            },
            _classType => super.sourceFor(t),
            _mapType => super.sourceFor(t),
            _enumType => super.sourceFor(t),
            _unionType => super.sourceFor(t),
            _transformedStringType => super.sourceFor(t)
        );
    }

    protected emitClassPropertiesMarkdown(c: ClassType): void {
        this.emitLine("### Properties");
        this.emitLine("");

        this.forEachClassProperty(c, "none", (name, jsonName, p) => {
            const t = p.type;
            const description = this.descriptionForClassProperty(c, jsonName);
            this.emitLine(
                "* `", name, "`",
                p.isOptional ? " (optional)" : "",
                ": <code>",
                this.sourceFor(t).source,
                "</code>"
            );

            if (description !== undefined) {
                this.emitLine("");
                this.indent(() => {
                    this.emitDescription(description);
                });
                this.emitLine("");
            }
        });
    }

    protected emitDescription(description: Sourcelike[] | undefined): void {
        if (description === undefined) return;
        for(const descriptionPart of description) {
            this.emitLine(descriptionPart);
        }
    }

    protected emitTypes(): void {
        this.forEachNamedType(
            "leading-and-interposing",
            (c: ClassType, n: Name) => this.emitClassMarkdown(c, n),
            (e, n) => this.emitEnumMarkdown(e, n),
            () => {} // Never emit unions
        );
    }
}

async function main(program: string, args: string[]): Promise<void> {
    // Exactly one command line argument allowed, the name of the JSON Schema file.
    if (args.length !== 2) {
        console.error(`Usage: ${program} SCHEMA_NAME SCHEMA_FILE`);
        process.exit(1);
    }

    const inputData = new InputData();
    const source = { name: args[0], schema: fs.readFileSync(args[1], "utf8") };
    await inputData.addSource("schema", source, () => new JSONSchemaInput(undefined));

    const lang = new MarkdownTargetLanguage();

    // What we get back from running "quicktype" is the source code as an array of lines.
    const { lines } = await quicktype({ lang, inputData });

    for (const line of lines) {
        console.log(line);
    }
}

main(process.argv[1], process.argv.slice(2));
