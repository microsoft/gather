// Type declarations from: https://stackoverflow.com/questions/42617303/how-do-i-consume-custom-type-definitions-for-an-npm-module
declare module Jison
{
    export class Parser {
        constructor(grammar:any);
        generate():string;
        parse(program:string):any;
    }
}

declare module "jison"
{
    export = Jison;
}