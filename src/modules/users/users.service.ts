import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: this.normalizeEmail(email) })
      .getOne();
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    username: string;
  }, manager?: EntityManager): Promise<User> {
    const repo = manager ? manager.getRepository(User) : this.usersRepository;
    const user = repo.create({
      ...data,
      email: this.normalizeEmail(data.email),
    });
    return repo.save(user);
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.usersRepository.count({
      where: { email: this.normalizeEmail(email) },
    });
    return count > 0;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
