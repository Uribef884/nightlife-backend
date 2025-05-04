import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
  } from "typeorm";
  
  export type UserRole = "user" | "clubOwner" | "bouncer" | "admin" ;
  
  @Entity()
  export class User {
    @PrimaryGeneratedColumn("uuid")
    id!: string;
  
    @Column({ unique: true })
    email!: string;
  
    @Column()
    password!: string;
  
    @Column({
      type: "varchar",
      default: "user"
    })
    role!: UserRole;
  
    @CreateDateColumn()
    createdAt!: Date;
  
    @UpdateDateColumn()
    updatedAt!: Date;
  }
  