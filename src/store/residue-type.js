/**
 * @file Residue Type
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @private
 */


import { calculateResidueBonds } from "../structure/structure-utils.js";
import {
    ProteinType, RnaType, DnaType, WaterType, IonType, SaccharideType, UnknownType,
    ProteinBackboneType, RnaBackboneType, DnaBackboneType, UnknownBackboneType,
    CgProteinBackboneType, CgRnaBackboneType, CgDnaBackboneType,
    ChemCompProtein, ChemCompRna, ChemCompDna, ChemCompSaccharide,
    ChemCompOther, ChemCompNonPolymer, ChemCompHetero,
    AA3, PurinBases, RnaBases, DnaBases, IonNames, WaterNames,
    ProteinBackboneAtoms, NucleicBackboneAtoms, ResidueTypeAtoms
} from "../structure/structure-constants.js";

import THREE from "../../lib/three.js";


/**
 * Propogates a depth-first search. TODO: Iterative deepening search instead?
 * bondGraph[ai1] is an array of bonded atom IDs.
 * visited is the current path of atoms (JS array)
 * maxDepth is maximum recursion depth
 *
 */
function propogateSearch( bondGraph, visited, maxDepth ) {

    var current = visited[visited.length-1];
    var neighbours = bondGraph[current];

    for (var i = 0; i < neighbours.length; ++i) {

        // Does this close the ring?
        if( visited.length >= 3 && visited[0] === neighbours[i] ) {
            // Hoorah, this is a ring!
            return true;
        }
        if( maxDepth > 0 ) {
            if (visited.indexOf(neighbours[i]) !== -1) {
                continue;
            }
            // Propogate
            visited.push(neighbours[i]);
            if (propogateSearch( bondGraph, visited, maxDepth-1)) {
                return true;
            }
            visited.pop();
        }

    }

}


function ResidueType( structure, resname, atomTypeIdList, hetero, chemCompType, bonds ){

    this.structure = structure;

    this.resname = resname;
    this.atomTypeIdList = atomTypeIdList;
    this.hetero = hetero ? 1 : 0;
    this.chemCompType = chemCompType;
    this.bonds = bonds;
    this.atomCount = atomTypeIdList.length;

    this.moleculeType = this.getMoleculeType();
    this.backboneType = this.getBackboneType( 0 );
    this.backboneEndType = this.getBackboneType( -1 );
    this.backboneStartType = this.getBackboneType( 1 );
    this.backboneIndexList = this.getBackboneIndexList();

    // Sparse array containing the reference atoms for each bond.
    this.bondReferenceAtoms = [];
    this.assignBondReferenceAtoms();

    var atomnames = ResidueTypeAtoms[ this.backboneType ];
    var atomnamesStart = ResidueTypeAtoms[ this.backboneStartType ];
    var atomnamesEnd = ResidueTypeAtoms[ this.backboneEndType ];

    var traceIndex = this.getAtomIndexByName( atomnames.trace );
    this.traceAtomIndex = traceIndex !== undefined ? traceIndex : -1;

    var dir1Index = this.getAtomIndexByName( atomnames.direction1 );
    this.direction1AtomIndex = dir1Index !== undefined ? dir1Index : -1;

    var dir2Index = this.getAtomIndexByName( atomnames.direction2 );
    this.direction2AtomIndex = dir2Index !== undefined ? dir2Index : -1;

    var bbStartIndex = this.getAtomIndexByName( atomnamesStart.backboneStart );
    this.backboneStartAtomIndex = bbStartIndex !== undefined ? bbStartIndex : -1;

    var bbEndIndex = this.getAtomIndexByName( atomnamesEnd.backboneEnd );
    this.backboneEndAtomIndex = bbEndIndex !== undefined ? bbEndIndex : -1;

    var rungEndIndex;
    if( PurinBases.indexOf( resname ) !== -1 ){
        rungEndIndex = this.getAtomIndexByName( "N1" );
    }else{
        rungEndIndex = this.getAtomIndexByName( "N3" );
    }
    this.rungEndAtomIndex = rungEndIndex !== undefined ? rungEndIndex : -1;

}

ResidueType.prototype = {

    constructor: ResidueType,
    type: "ResidueType",

    resname: undefined,
    atomTypeIdList: undefined,
    atomCount: undefined,

    getBackboneIndexList: function(){
        var backboneIndexList = [];
        var atomnameList;
        switch( this.moleculeType ){
            case ProteinType:
                atomnameList = ProteinBackboneAtoms;
                break;
            case RnaType:
            case DnaType:
                atomnameList = NucleicBackboneAtoms;
                break;
            default:
                return backboneIndexList;
        }
        var atomMap = this.structure.atomMap;
        var atomTypeIdList = this.atomTypeIdList;
        for( var i = 0, il = this.atomCount; i < il; ++i ){
            var atomType = atomMap.get( atomTypeIdList[ i ] );
            if( atomnameList.indexOf( atomType.atomname ) !== -1 ){
                backboneIndexList.push( i );
            }
        }
        return backboneIndexList;
    },

    getMoleculeType: function(){
        if( this.isProtein() ){
            return ProteinType;
        }else if( this.isRna() ){
            return RnaType;
        }else if( this.isDna() ){
            return DnaType;
        }else if( this.isWater() ){
            return WaterType;
        }else if( this.isIon() ){
            return IonType;
        }else if( this.isSaccharide() ){
            return SaccharideType;
        }else{
            return UnknownType;
        }
    },

    getBackboneType: function( position ){
        if( this.hasProteinBackbone( position ) ){
            return ProteinBackboneType;
        }else if( this.hasRnaBackbone( position ) ){
            return RnaBackboneType;
        }else if( this.hasDnaBackbone( position ) ){
            return DnaBackboneType;
        }else if( this.hasCgProteinBackbone( position ) ){
            return CgProteinBackboneType;
        }else if( this.hasCgRnaBackbone( position ) ){
            return CgRnaBackboneType;
        }else if( this.hasCgDnaBackbone( position ) ){
            return CgDnaBackboneType;
        }else{
            return UnknownBackboneType;
        }
    },

    isProtein: function(){
        if( this.chemCompType ){
            return ChemCompProtein.indexOf( this.chemCompType ) !== -1;
        }else{
            return (
                this.hasAtomWithName( "CA", "C", "N" ) ||
                AA3.indexOf( this.resname ) !== -1
            );
        }
    },

    isCg: function(){
        var backboneType = this.backboneType;
        return (
            backboneType === CgProteinBackboneType ||
            backboneType === CgRnaBackboneType ||
            backboneType === CgDnaBackboneType
        );
    },

    isNucleic: function(){
        return this.isRna() || this.isDna();
    },

    isRna: function(){
        if( this.chemCompType ){
            return ChemCompRna.indexOf( this.chemCompType ) !== -1;
        }else{
            return (
                this.hasAtomWithName( [ "P", "O3'", "O3*" ], [ "C4'", "C4*" ], [ "O2'", "O2*" ] ) ||
                RnaBases.indexOf( this.resname ) !== -1
            );
        }
    },

    isDna: function(){
        if( this.chemCompType ){
            return ChemCompDna.indexOf( this.chemCompType ) !== -1;
        }else{
            return (
                ( this.hasAtomWithName( [ "P", "O3'", "O3*" ], [ "C3'", "C3*" ] ) &&
                    !this.hasAtomWithName( [ "O2'", "O2*" ] ) ) ||
                DnaBases.indexOf( this.resname ) !== -1
            );
        }
    },

    isPolymer: function(){
        return this.isProtein() || this.isNucleic();
    },

    isHetero: function(){
        return this.hetero === 1;
    },

    isIon: function(){
        return IonNames.indexOf( this.resname ) !== -1;
    },

    isWater: function(){
        return WaterNames.indexOf( this.resname ) !== -1;
    },

    isSaccharide: function(){
        return ChemCompSaccharide.indexOf( this.chemCompType ) !== -1;
    },

    hasBackboneAtoms: function( position, type ){
        var atomnames = ResidueTypeAtoms[ type ];
        if( position === -1 ){
            return this.hasAtomWithName(
                atomnames.trace,
                atomnames.backboneEnd,
                atomnames.direction1,
                atomnames.direction2
            );
        }else if( position === 0 ){
            return this.hasAtomWithName(
                atomnames.trace,
                atomnames.direction1,
                atomnames.direction2
            );
        }else if( position === 1 ){
            return this.hasAtomWithName(
                atomnames.trace,
                atomnames.backboneStart,
                atomnames.direction1,
                atomnames.direction2
            );
        }else{
            return this.hasAtomWithName(
                atomnames.trace,
                atomnames.backboneStart,
                atomnames.backboneEnd,
                atomnames.direction1,
                atomnames.direction2
            );
        }
    },

    hasProteinBackbone: function( position ){
        return (
            this.isProtein() &&
            this.hasBackboneAtoms( position, ProteinBackboneType )
        );
    },

    hasRnaBackbone: function( position ){
        return (
            this.isRna() &&
            this.hasBackboneAtoms( position, RnaBackboneType )
        );
    },

    hasDnaBackbone: function( position ){
        return (
            this.isDna() &&
            this.hasBackboneAtoms( position, DnaBackboneType )
        );
    },

    hasCgProteinBackbone: function( position ){
        return (
            this.isProtein() &&
            this.hasBackboneAtoms( position, CgProteinBackboneType )
        );
    },

    hasCgRnaBackbone: function( position ){
        return (
            this.isRna() &&
            this.hasBackboneAtoms( position, CgRnaBackboneType )
        );
    },

    hasCgDnaBackbone: function( position ){
        return (
            this.isDna() &&
            this.hasBackboneAtoms( position, CgDnaBackboneType )
        );
    },

    hasBackbone: function( position ){
        return (
            this.hasProteinBackbone( position ) ||
            this.hasRnaBackbone( position ) ||
            this.hasDnaBackbone( position ) ||
            this.hasCgProteinBackbone( position ) ||
            this.hasCgRnaBackbone( position ) ||
            this.hasCgDnaBackbone( position )
        );
    },

    getAtomIndexByName: function( atomname ){
        var i, index;
        var n = this.atomCount;
        var atomMap = this.structure.atomMap;
        var atomTypeIdList = this.atomTypeIdList;
        if( Array.isArray( atomname ) ){
            for( i = 0; i < n; ++i ){
                index = atomTypeIdList[ i ];
                if( atomname.indexOf( atomMap.get( index ).atomname ) !== -1 ){
                    return i;
                }
            }
        }else{
            for( i = 0; i < n; ++i ){
                index = atomTypeIdList[ i ];
                if( atomname === atomMap.get( index ).atomname ){
                    return i;
                }
            }
        }
        return undefined;
    },

    hasAtomWithName: function( atomname ){
        var n = arguments.length;
        for( var i = 0; i < n; ++i ){
            if( arguments[ i ] === undefined ) continue;
            if( this.getAtomIndexByName( arguments[ i ] ) === undefined ){
                return false;
            }
        }
        return true;
    },

    getBonds: function( r ){
        if( this.bonds === undefined ){
            this.bonds = calculateResidueBonds( r );
        }
        return this.bonds;
    },

    /**
     * For bonds with order > 1, pick a reference atom
     */
    assignBondReferenceAtoms: function( params ) {
        var p = Object.assign( { maxRingSize: 8 }, params );

        var atomIndices1 = this.bonds.atomIndices1;
        var atomIndices2 = this.bonds.atomIndices2;
        var bondOrders = this.bonds.bondOrders;
        var bondReferenceAtoms = this.bondReferenceAtoms;

        var nb = this.bonds.atomIndices1.length;

        // Various ways to do this - here we calculate the bondGraph. Might
        // want to defer this, or build portions as needed using
        // AtomProxy.getResidueBonds?
        var bondGraph = {}; //{ ai1: [ ai2, ... ] }

        for( var i = 0; i < nb; ++i ) {

            var ai1 = atomIndices1[i];
            var ai2 = atomIndices2[i];

            var a1 = bondGraph[ ai1 ] = bondGraph[ ai1 ] || [];
            a1.push(ai2);
            //a1[ ai2 ] = bondOrders[i];

            var a2 = bondGraph[ ai2 ] = bondGraph[ ai2 ] || [];
            a2.push(ai1);
            //[ ai1 ] = bondOrders[i];

        }

        bondReferenceAtoms.length = 0;  // reset array

        for(var i = 0; i < nb; ++i ) {

            var ai1 = atomIndices1[i];
            var ai2 = atomIndices2[i];

            // Not required for single bonds
            if (this.bonds.bondOrders[i] <= 1) continue;

            // Check if atom is terminal?
            if ( bondGraph[ai1].length == 1 ) {

                if ( bondGraph[ai2].length == 1 ) {
                    // No reference atom can be found
                    continue;
                }

                // Take first bonded partner of a2 that isn't a1
                for (var ai3 in bondGraph[ai2]) {
                    if (ai3 != ai1) {
                        bondReferenceAtoms[i] = ai3;
                        break;
                    }
                }
                continue;

            }

            if ( bondGraph[ai2].length == 1 ) {
                // Reverse of above:
                for (var ai3 in bondGraph[ai1]) {
                    if (ai3 != ai2) {
                        bondReferenceAtoms[i] = ai3;
                        break;
                    }
                }
                continue;
            }

            var visited = [ai1, ai2];
            var maxDepth = 3;
            // Naive method (don't store intermediate results)
            while (maxDepth < p.maxRingSize - 3) {
                if( propogateSearch( bondGraph, visited, p.maxRingSize - 3 ) ) {
                    bondReferenceAtoms[i] = visited[2];
                    break;
                }
                maxDepth += 1;
            };

            // Not a ring, just pick one atom:
            if( bondReferenceAtoms[i] === undefined) {
                for (var ai3 in bondGraph[ai1]) {
                    if (ai3 != ai2) {
                        bondReferenceAtoms[i] = ai3;
                    }
                }
            }
        }
    },

    // Bonds will typically be queried in order
    _lastBondIdx: 0,

    /** Find ai3 for the bond between ap1 and ap2, if possible.
     *
     * @returns an integer atom index, or null if cannot determine one.
     */
    getBondReferenceAtom: function( ap1, ap2 ) {
        if( ap1.residueIndex !== ap2.residueIndex ) {
            return null; // Bond between residues, for now ignore (could detect)
        }
        var typeAtomIdx1 = ap1.index - ap1.residueAtomOffset;
        var typeAtomIdx2 = ap2.index - ap2.residueAtomOffset;
        // Sanity check
        if( (Math.max(typeAtomIdx1, typeAtomIdx2) >= this.atomCount) ||
            ( Math.min(typeAtomIdx1, typeAtomIdx2) < 0)) {
            console.error("Something went wrong mapping atoms to ResidueType");
            return null;
        }

        var bonds = this.bonds;
        var nBonds = this.bonds.atomIndices1.length;
        if( !this.bondReferenceAtoms ) { this.assignBondReferenceAtoms(); }

        for( var i=0, j=this._lastBondIdx; i<nBonds; i++, j++) {
            if( j === nBonds ) j = 0;
            if( ( typeAtomIdx1 === bonds.atomIndices1[j] &&
                    typeAtomIdx2 === bonds.atomIndices2[j] ) ||
                ( typeAtomIdx1 === bonds.atomIndices2[j] &&
                    typeAtomIdx2 === bonds.atomIndices1[j] )
            ){
                this._lastBondIdx = j;
                var typeAtomIdx3 = this.bondReferenceAtoms[j];
                if( Number.isInteger( typeAtomIdx3 ) ) {
                    return typeAtomIdx3 + ap1.residueAtomOffset;
                } else {
                    return null;
                }
            }
        }
        return null;
    },

    _p1: new THREE.Vector3(),
    _p2: new THREE.Vector3(),
    _p3: new THREE.Vector3(),

    /* Returns a THREE Vector3 instance */
    calculateShiftDir: function( ap1, ap2, v ) {
        if( !v ) v = new THREE.Vector3();
        var coLinear = false; // TODO: An actual fallback for this case!

        var ai3 = this.getBondReferenceAtom( ap1, ap2 );
        var p3 = this._p3;
        var p2 = this._p2;
        var p1 = this._p1;

        if( ai3 !== null ) {
            this.structure.getAtomProxy( ai3 ).positionToVector3( p3 );
        } else {
            p3.set( 0, 0, 0 ); // Some arbitrary reference point
        }

        ap1.positionToVector3( p1 );
        var v12 = ap2.positionToVector3( p2 ).sub( p1 );
        var v13 = p3.sub( p1 );
        var theta = v12.dot( v13 ) / Math.sqrt( v12.lengthSq() * v13.lengthSq() );

        if( 1 - Math.abs( theta ) < 1e-5 ){
            // More or less colinear:
            coLinear = true;
            console.warn("Colinear reference atom");
        }

        return v.copy( v13.sub( v12 ).normalize() );
    },

    toJSON: function(){
        var output = {
            resname: this.resname,
            atomTypeIdList: this.atomTypeIdList,
            hetero: this.hetero
        };
        return output;
    }

};


export default ResidueType;
