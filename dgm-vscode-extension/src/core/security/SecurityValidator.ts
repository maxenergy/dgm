import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import { ValidationResult, ValidationError, ValidationWarning, WarningSeverity } from '@shared/types';
import { Logger } from '@shared/utils/Logger';

export interface SecurityRule {
    name: string;
    description: string;
    severity: 'error' | 'warning';
    check: (ast: any) => ValidationIssue[];
}

export interface ValidationIssue {
    message: string;
    line?: number;
    column?: number;
    code?: string;
}

export class SecurityValidator {
    private readonly logger = new Logger('SecurityValidator');
    private readonly dangerousPatterns = [
        /eval\s*\(/,
        /new\s+Function\s*\(/,
        /require\s*\(\s*['"`]child_process['"`]\s*\)/,
        /require\s*\(\s*['"`]fs['"`]\s*\)/,
        /process\s*\.\s*exit\s*\(/,
        /__dirname/,
        /__filename/,
        /global\s*\./,
        /process\s*\.\s*env/
    ];

    private readonly suspiciousPatterns = [
        /setTimeout\s*\(/,
        /setInterval\s*\(/,
        /XMLHttpRequest/,
        /fetch\s*\(/,
        /import\s*\(/,
        /require\s*\([^'"]/  // Dynamic require
    ];

    private readonly securityRules: SecurityRule[] = [
        {
            name: 'no-eval',
            description: 'Disallow use of eval()',
            severity: 'error',
            check: this.checkNoEval.bind(this)
        },
        {
            name: 'no-function-constructor',
            description: 'Disallow Function constructor',
            severity: 'error',
            check: this.checkNoFunctionConstructor.bind(this)
        },
        {
            name: 'no-dangerous-modules',
            description: 'Disallow dangerous Node.js modules',
            severity: 'error',
            check: this.checkNoDangerousModules.bind(this)
        },
        {
            name: 'no-process-manipulation',
            description: 'Disallow process manipulation',
            severity: 'error',
            check: this.checkNoProcessManipulation.bind(this)
        },
        {
            name: 'no-global-access',
            description: 'Restrict global object access',
            severity: 'warning',
            check: this.checkNoGlobalAccess.bind(this)
        }
    ];

    async validateCode(code: string): Promise<ValidationResult> {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        try {
            // Quick pattern check
            const patternIssues = this.checkPatterns(code);
            errors.push(...patternIssues.errors);
            warnings.push(...patternIssues.warnings);

            // AST-based analysis
            const ast = this.parseCode(code);
            if (ast) {
                const astIssues = this.analyzeAST(ast);
                errors.push(...astIssues.errors);
                warnings.push(...astIssues.warnings);
            }

            // Check for obfuscation attempts
            if (this.isObfuscated(code)) {
                warnings.push({
                    field: 'code',
                    message: 'Code appears to be obfuscated',
                    severity: WarningSeverity.High
                });
            }

        } catch (error) {
            this.logger.error('Code validation error', error);
            errors.push({
                field: 'code',
                message: 'Failed to parse code',
                code: 'PARSE_ERROR'
            });
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    async validateMutation(originalCode: string, mutatedCode: string): Promise<ValidationResult> {
        // Validate the mutated code
        const result = await this.validateCode(mutatedCode);

        // Additional checks for mutations
        if (result.isValid) {
            // Check if mutation introduces new dangerous patterns
            const newPatterns = this.findNewPatterns(originalCode, mutatedCode);
            if (newPatterns.length > 0) {
                result.errors.push({
                    field: 'mutation',
                    message: `Mutation introduces dangerous patterns: ${newPatterns.join(', ')}`,
                    code: 'DANGEROUS_MUTATION'
                });
                result.isValid = false;
            }
        }

        return result;
    }

    private checkPatterns(code: string): { errors: ValidationError[]; warnings: ValidationWarning[] } {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        // Check dangerous patterns
        this.dangerousPatterns.forEach((pattern, index) => {
            if (pattern.test(code)) {
                errors.push({
                    field: 'code',
                    message: `Dangerous pattern detected: ${pattern.source}`,
                    code: `DANGEROUS_PATTERN_${index}`
                });
            }
        });

        // Check suspicious patterns
        this.suspiciousPatterns.forEach((pattern, index) => {
            if (pattern.test(code)) {
                warnings.push({
                    field: 'code',
                    message: `Suspicious pattern detected: ${pattern.source}`,
                    severity: WarningSeverity.Medium
                });
            }
        });

        return { errors, warnings };
    }

    private parseCode(code: string): any {
        try {
            return parser.parse(code, {
                sourceType: 'module',
                plugins: ['typescript', 'jsx'],
                errorRecovery: true
            });
        } catch (error) {
            this.logger.warn('Failed to parse code as module, trying script mode', error);
            try {
                return parser.parse(code, {
                    sourceType: 'script',
                    errorRecovery: true
                });
            } catch (scriptError) {
                this.logger.error('Failed to parse code', scriptError);
                return null;
            }
        }
    }

    private analyzeAST(ast: any): { errors: ValidationError[]; warnings: ValidationWarning[] } {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        this.securityRules.forEach(rule => {
            const issues = rule.check(ast);
            issues.forEach(issue => {
                if (rule.severity === 'error') {
                    errors.push({
                        field: 'code',
                        message: `${rule.name}: ${issue.message}`,
                        code: rule.name.toUpperCase().replace(/-/g, '_')
                    });
                } else {
                    warnings.push({
                        field: 'code',
                        message: `${rule.name}: ${issue.message}`,
                        severity: WarningSeverity.Medium
                    });
                }
            });
        });

        return { errors, warnings };
    }

    private checkNoEval(ast: any): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        traverse(ast, {
            CallExpression(path: any) {
                if (path.node.callee.name === 'eval') {
                    issues.push({
                        message: 'eval() is not allowed',
                        line: path.node.loc?.start.line,
                        column: path.node.loc?.start.column
                    });
                }
            }
        });

        return issues;
    }

    private checkNoFunctionConstructor(ast: any): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        traverse(ast, {
            NewExpression(path: any) {
                if (path.node.callee.name === 'Function') {
                    issues.push({
                        message: 'Function constructor is not allowed',
                        line: path.node.loc?.start.line,
                        column: path.node.loc?.start.column
                    });
                }
            }
        });

        return issues;
    }

    private checkNoDangerousModules(ast: any): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const dangerousModules = ['fs', 'child_process', 'net', 'http', 'https', 'cluster', 'os'];

        traverse(ast, {
            CallExpression(path: any) {
                if (path.node.callee.name === 'require' &&
                    path.node.arguments.length > 0 &&
                    path.node.arguments[0].type === 'StringLiteral') {
                    const moduleName = path.node.arguments[0].value;
                    if (dangerousModules.includes(moduleName)) {
                        issues.push({
                            message: `Module '${moduleName}' is not allowed`,
                            line: path.node.loc?.start.line,
                            column: path.node.loc?.start.column
                        });
                    }
                }
            },
            ImportDeclaration(path: any) {
                const moduleName = path.node.source.value;
                if (dangerousModules.includes(moduleName)) {
                    issues.push({
                        message: `Import of '${moduleName}' is not allowed`,
                        line: path.node.loc?.start.line,
                        column: path.node.loc?.start.column
                    });
                }
            }
        });

        return issues;
    }

    private checkNoProcessManipulation(ast: any): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const dangerousMethods = ['exit', 'abort', 'kill', 'send'];

        traverse(ast, {
            MemberExpression(path: any) {
                if (path.node.object.name === 'process' &&
                    dangerousMethods.includes(path.node.property.name)) {
                    issues.push({
                        message: `process.${path.node.property.name}() is not allowed`,
                        line: path.node.loc?.start.line,
                        column: path.node.loc?.start.column
                    });
                }
            }
        });

        return issues;
    }

    private checkNoGlobalAccess(ast: any): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        traverse(ast, {
            Identifier(path: any) {
                if (path.node.name === 'global' && path.isReferencedIdentifier()) {
                    issues.push({
                        message: 'Direct global object access detected',
                        line: path.node.loc?.start.line,
                        column: path.node.loc?.start.column
                    });
                }
            }
        });

        return issues;
    }

    private isObfuscated(code: string): boolean {
        // Simple heuristics for obfuscation detection
        const lines = code.split('\n');
        const avgLineLength = code.length / lines.length;
        
        // Check for unusually long lines
        if (avgLineLength > 200) {
            return true;
        }

        // Check for excessive use of hex/unicode escapes
        const hexEscapes = (code.match(/\\x[0-9a-fA-F]{2}/g) || []).length;
        const unicodeEscapes = (code.match(/\\u[0-9a-fA-F]{4}/g) || []).length;
        if (hexEscapes + unicodeEscapes > code.length / 100) {
            return true;
        }

        // Check for base64 encoded strings
        const base64Pattern = /[A-Za-z0-9+/]{50,}={0,2}/g;
        const base64Matches = code.match(base64Pattern) || [];
        if (base64Matches.length > 5) {
            return true;
        }

        return false;
    }

    private findNewPatterns(originalCode: string, mutatedCode: string): string[] {
        const newPatterns: string[] = [];

        this.dangerousPatterns.forEach(pattern => {
            if (!pattern.test(originalCode) && pattern.test(mutatedCode)) {
                newPatterns.push(pattern.source);
            }
        });

        return newPatterns;
    }

    addSecurityRule(rule: SecurityRule): void {
        this.securityRules.push(rule);
    }

    removeSecurityRule(name: string): void {
        const index = this.securityRules.findIndex(r => r.name === name);
        if (index !== -1) {
            this.securityRules.splice(index, 1);
        }
    }
}