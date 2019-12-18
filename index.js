let acorn = require(`acorn`);

class Scope {
	constructor(type, index) {
		Object.assign(this, {
			type,
			identifiers: [],
			subScopes: [],
		})

		if (type !== `global`)
			this.index = index;
	}

	newScope(type, scopePath) {
		const
			parentScope = scopePath[scopePath.length - 1],
			scope = new Scope(type, parentScope.identifiers.length);

		parentScope.subScopes.push(scope);
		return scopePath.concat([scope]);
	}

	addIdent(scopePath, ident) {
		if (ident.declaration === `function`) {
			let lastFuncScope;
			for (let scope of [...scopePath].reverse())
				if ([`global`, `function`].includes(scope.type)) {
					lastFuncScope = scope;
					break;
				}

			lastFuncScope.identifiers.unshift(ident);
			for (let scope of lastFuncScope.subScopes)
				scope.index++;
		} else scopePath[scopePath.length - 1].identifiers.push(ident);
	}
}

const decTypes = {
	const: `lexical`,
	let: `lexical`,
	var: `function`,
}

const buildScopeTree = function f(
	input,
	globalScope,
	nodePath = [],
	lastKey = null,
	scopePath = [globalScope],
	decState = false,
) {
	function next(node) {
		function u(str, {newScopePath = scopePath, newState = decState} = {}) {
			f(node[str], globalScope, nodePath.concat([node]), str, newScopePath, newState);
		}

		switch (node.type) {
			case `ArrayExpression`:
			case `ArrayPattern`:
				u(`elements`); break;
			case `ArrowFunctionExpression`:
				{
					const newScopePath = globalScope.newScope(`function`, scopePath);
					u(`params`, {newScopePath, newState: `function`});
					u(`body`, {newScopePath});
				} break;
			case `AssignmentExpression`:
			case `AssignmentPattern`:
			case `BinaryExpression`:
			case `LogicalExpression`:
				u(`left`);
				u(`right`); break;
			case `AwaitExpression`:
			case `RestElement`:
			case `ReturnStatement`:
			case `SpreadElement`:
			case `ThrowStatement`:
			case `UnaryExpression`:
			case `UpdateExpression`:
				u(`argument`); break;
			case `BlockStatement`:
				switch (nodePath[nodePath.length - 1].type) {
					case `FunctionDeclaration`:
					case `FunctionExpression`:
						u(`body`, {newScopePath: globalScope.newScope(`function`, scopePath)}); break;
					default:
						u(`body`, {newScopePath: globalScope.newScope(`lexical`, scopePath)});
				} break;
			case `CallExpression`:
				u(`callee`);
				u(`arguments`); break;
			case `CatchClause`:
				{
					const newScopePath = globalScope.newScope(`lexical`, scopePath);
					u(`param`, {newScopePath, newState: `lexical`});
					u(`body`, {newScopePath});
				} break;
			case `ClassBody`:
				u(`body`, {newScopePath: globalScope.newScope(`lexical`, scopePath)}); break;
			case `ClassDeclaration`:
			case `ClassExpression`:
				u(`id`, {newState: `function`});
				u(`superClass`);
				u(`body`); break;
			case `DoWhileStatement`:
				u(`body`);
				u(`test`); break;
			case `ExpressionStatement`:
				u(`expression`); break;
			case `ForInStatement`:
			case `ForOfStatement`:
				{
					const newScopePath = globalScope.newScope(`lexical`, scopePath);
					u(`left`, {newScopePath});
					u(`right`, {newScopePath});
					u(`body`, {newScopePath});
				} break;
			case `ForStatement`:
				{
					const newScopePath = globalScope.newScope(`lexical`, scopePath);
					u(`init`, {newScopePath});
					u(`test`, {newScopePath});
					u(`update`, {newScopePath});
					u(`body`, {newScopePath});
				} break;
			case `FunctionDeclaration`:
			case `FunctionExpression`:
				{
					u(`id`, {newState: `function`});
					const newScopePath = globalScope.newScope(`function`, scopePath);
					u(`params`, {newScopePath, newState: `function`});
					u(`body`, {newScopePath});
				} break;
			case `Identifier`:
				if (![`property`, `key`].includes(lastKey))
					globalScope.addIdent(scopePath, {
						declaration: decState,
						name: node.name,
					});

				break;
			case `IfStatement`:
				u(`test`);
				u(`consequent`);
				u(`alternative`); break;
			case `LabeledStatement`:
			case `Program`:
				u(`body`); break;
			case `MemberExpression`:
				u(`object`);
				u(`property`); break;
			case `NewExpression`:
				u(`callee`);
				u(`arguments`); break;
			case `ObjectExpression`:
			case `ObjectPattern`:
				u(`properties`); break;
			case `MethodDefinition`:
			case `Property`:
				u(`key`, {newState: false});
				u(`value`); break;
			case `SwitchCase`:
				u(`test`);
				u(`consequent`); break;
			case `SwitchStatement`:
				u(`discriminant`);
				u(`cases`, {newScopePath: globalScope.newScope(`lexical`, scopePath)}); break;
			case `TaggedTemplateExpression`:
				u(`tag`);
				u(`quasi`); break;
			case `TemplateLiteral`:
				u(`expressions`); break;
			case `TryStatement`:
				u(`block`);
				u(`handler`);
				u(`finalizer`); break;
			case `VariableDeclaration`:
				u(`declarations`, {newState: decTypes[node.kind]}); break;
			case `VariableDeclarator`:
				u(`init`, {newState: false});
				u(`id`); break;
			case `WhileStatement`:
				u(`test`);
				u(`body`); break;
			case `WithStatement`:
				u(`object`);
				u(`body`); break;
			case `BreakStatement`:
			case `ContinueStatement`:
			case `DebuggerStatement`:
			case `EmptyStatement`:
			case `Literal`:
			case `ThisExpression`:
				break;
			default:
				console.dir(node);
		}
	}

	if (input)
		if (Array.isArray(input))
			for (let node of input)
				next(node);
		else
			next(input);
};

Set.prototype.union = function(set) {
	for (let entry of [...set])
		this.add(entry);
}

function getUndIds(code, options = {}) {
	options.allowAwaitOutsideFunction = true;

	const
		tree = acorn.parse(code, options),
		globalScope = new Scope(`global`);

	buildScopeTree(tree, globalScope);

	return (function f(scopePath) {
		const
			dIds = new Set,
			undIds = new Set,
			currentScope = scopePath[scopePath.length - 1];

		for (let ident of currentScope.identifiers)
			if (ident.declaration)
				dIds.add(ident.name);
			else if (!dIds.has(ident.name))
				undIds.add(ident.name);

		for (let i = scopePath.length - 2; i >= 0; i--) {
			for (let ident of scopePath[i].identifiers.slice(0, scopePath[i + 1].index))
				if (ident.declaration && undIds.has(ident.name))
					undIds.delete(ident.name);
		}

		for (let subScope of currentScope.subScopes)
			undIds.union(f(scopePath.concat([subScope])));

		return undIds;
	})([globalScope]);
}

module.exports = getUndIds;
