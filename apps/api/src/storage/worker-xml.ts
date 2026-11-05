import { DOMParser, Node } from '@xmldom/xmldom';

type XmlScope = {
	DOMParser?: typeof DOMParser;
	Node?: typeof Node;
};

const scope = globalThis as unknown as XmlScope;

// Wrangler follows the browser build of the AWS XML parser, which reads DOMParser and Node.
if (scope.DOMParser === undefined) {
	scope.DOMParser = DOMParser;
}

if (scope.Node === undefined) {
	scope.Node = Node;
}
