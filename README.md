- English Note -
*This is a project for my college*. This is a website application, where you can make a report of a problem happening in your neighborhood, see your reports and see other reports made by other people. It has a DataBase, so if you want to see, i recommend adjusting the code so you can use it with your own database, or simply remove the database stuff, because this have a fallback option you can use for a workaround, since the database implementation is being held by glue and hopes.
- Portuguese Note -
*Este é um projeto para minha faculdade* Isso é um aplicativo de website, onde você pode reportar problemas acontecendo em sua rua, ver seus problemas reportados e ver outros feitos por outras pessoas. Ele tem um banco de dados, então caso queira usar, recomendo ajustar o codigo para que você possa usar seu proprio banco de dados, ou simplesmente remova as coisas de banco de dados, por causa que ele tem uma opção de fallback que você pode usar de gambiarra, já que a implementação do banco de dados está sendo sustentada por sonhos e esperanças.

Use this in your database so my code works / Use isso em seu bando de dados para meu codigo funcionar

CREATE DATABASE IF NOT EXISTS cidade_perfeita CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cidade_perfeita;

CREATE TABLE IF NOT EXISTS reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  original_id BIGINT NOT NULL UNIQUE,
  reporter VARCHAR(120) DEFAULT 'Anônimo',
  reporterId VARCHAR(200) DEFAULT NULL,
  description TEXT,
  type VARCHAR(50) DEFAULT 'outros',
  photoPath VARCHAR(400) NOT NULL,
  location_lat DOUBLE DEFAULT NULL,
  location_lng DOUBLE DEFAULT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
